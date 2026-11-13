import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServerApp } from '../src/server.js';
import { createStore } from '../src/store.js';

/**
 * 用临时目录做夹具，避免测试依赖真实项目根目录的内容变化。
 * 目录结构与真实项目一致：index.html + assets/ + 一些「不该被访问」的文件。
 */
let rootDir;
let app;

beforeAll(() => {
  rootDir = mkdtempSync(path.join(tmpdir(), 'suiyu-server-'));
  mkdirSync(path.join(rootDir, 'assets'), { recursive: true });
  mkdirSync(path.join(rootDir, 'server', 'src'), { recursive: true });
  mkdirSync(path.join(rootDir, 'node_modules', 'left-pad'), { recursive: true });

  writeFileSync(path.join(rootDir, 'index.html'), '<!doctype html><html><body>FIXTURE_INDEX</body></html>');
  writeFileSync(path.join(rootDir, 'assets', 'app.js'), 'console.log("fixture");');
  writeFileSync(path.join(rootDir, 'assets', 'styles.css'), 'body{color:red}');
  writeFileSync(path.join(rootDir, 'package.json'), '{"name":"secret"}');
  writeFileSync(path.join(rootDir, 'README.md'), 'secret readme');
  writeFileSync(path.join(rootDir, 'server', 'src', 'store.js'), 'export const secret = 1;');
  writeFileSync(path.join(rootDir, 'node_modules', 'left-pad', 'index.js'), 'module.exports=1;');

  app = createServerApp({ store: createStore(), rootDir });
});

afterAll(() => {
  rmSync(rootDir, { recursive: true, force: true });
});

describe('静态资源白名单', () => {
  it('GET / 返回 HTML 首页', async () => {
    const res = await app.request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('FIXTURE_INDEX');
  });

  it('GET /assets/app.js 正常返回脚本', async () => {
    const res = await app.request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('javascript');
    expect(await res.text()).toContain('fixture');
  });

  it('GET /assets/styles.css 正常返回样式', async () => {
    const res = await app.request('/assets/styles.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('css');
    expect(await res.text()).toContain('body');
  });

  it.each([
    '/package.json',
    '/README.md',
    '/server/src/store.js',
    '/server/src/index.js',
    '/node_modules/left-pad/index.js',
  ])('GET %s 不得被暴露（404）', async (url) => {
    const res = await app.request(url);
    expect(res.status).toBe(404);
    const body = await res.text();
    expect(body).not.toContain('secret');
    expect(body).not.toContain('module.exports');
  });

  it('GET /assets/../package.json 目录穿越被拒绝', async () => {
    const res = await app.request('/assets/../package.json');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('secret');
  });

  it('GET /assets/%2e%2e%2fpackage.json 编码穿越被拒绝', async () => {
    const res = await app.request('/assets/%2e%2e%2fpackage.json');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('secret');
  });
});

describe('API 与静态资源的边界', () => {
  it('GET /api/unknown 返回 JSON 404，不回退 HTML', async () => {
    const res = await app.request('/api/unknown');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).toContain('application/json');
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('GET /api/posts 仍可用，且与静态资源不冲突', async () => {
    const res = await app.request('/api/posts');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ posts: [] });
  });

  it('带扩展名的未知路径不返回 HTML（404）', async () => {
    const res = await app.request('/whatever.json');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('FIXTURE_INDEX');
  });

  it('无扩展名的前端路由回退到 index.html', async () => {
    const res = await app.request('/some/spa/route');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('FIXTURE_INDEX');
  });

  it('非 GET 的未知路径返回 404', async () => {
    const res = await app.request('/foo', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
