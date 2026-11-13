import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 前端契约测试：不启动浏览器，直接静态检查前端产物。
 * 目的是锁住「数据只走后端 REST 接口」「长度口径与后端一致」这两条硬约束，
 * 防止以后有人把 Local Storage 或 UTF-16 码元计数加回来。
 */

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const appJs = readFileSync(path.join(rootDir, 'assets', 'app.js'), 'utf8');
const indexHtml = readFileSync(path.join(rootDir, 'index.html'), 'utf8');

describe('前端不再使用浏览器本地存储', () => {
  it('app.js 中不出现 localStorage / sessionStorage', () => {
    expect(appJs).not.toMatch(/localStorage/);
    expect(appJs).not.toMatch(/sessionStorage/);
  });

  it('app.js 通过 /api/posts 访问后端接口', () => {
    expect(appJs).toContain('/api/posts');
    expect(appJs).toContain('fetch');
  });
});

describe('前端长度口径与后端一致（Unicode 码点）', () => {
  it('app.js 使用 Array.from 按码点计数', () => {
    expect(appJs).toMatch(/Array\.from\(/);
  });

  it('app.js 不再直接用 input.value.length 计数字符', () => {
    expect(appJs).not.toMatch(/input\.value\.length/);
  });

  it('app.js 发布前不再用 text.length 做长度拦截', () => {
    expect(appJs).not.toMatch(/text\.length\s*>\s*MAX_LEN/);
  });

  it('index.html 的 textarea 不使用 maxlength 硬截断（否则 emoji 会被提前拦住）', () => {
    const textarea = indexHtml.match(/<textarea[^>]*>/i);
    expect(textarea).not.toBeNull();
    expect(textarea[0]).not.toMatch(/maxlength/i);
  });
});

describe('点赞 / 收藏走服务端接口', () => {
  it('app.js 调用了点赞与收藏接口', () => {
    expect(appJs).toContain('/like');
    expect(appJs).toContain('/favorite');
  });

  it('app.js 用 PUT 显式提交目标状态（幂等，不做 toggle 语义）', () => {
    expect(appJs).toMatch(/'PUT'/);
    expect(appJs).toContain('liked:');
    expect(appJs).toContain('favorited:');
  });

  it('按钮用 aria-pressed 表达开关状态', () => {
    expect(appJs).toContain('aria-pressed');
  });

  it('点赞 / 收藏状态依然不落地到浏览器本地存储', () => {
    expect(appJs).not.toMatch(/localStorage/);
    expect(appJs).not.toMatch(/sessionStorage/);
  });
});

describe('收藏筛选在页面结构中可被定位', () => {
  it('index.html 提供「收藏」筛选控件', () => {
    expect(indexHtml).toContain('id="feedFilters"');
    expect(indexHtml).toContain('data-filter="favorites"');
  });

  it('app.js 会绑定该筛选控件并做本地过滤', () => {
    expect(appJs).toContain('filterFavorites');
    expect(appJs).toContain("=== 'favorites'");
  });
});
