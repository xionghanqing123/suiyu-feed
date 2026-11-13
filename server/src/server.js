import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createApp } from './app.js';
import { createStore } from './store.js';

/** 静态资源白名单内可用的扩展名 → Content-Type */
const MIME_TYPES = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

function mimeOf(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * 判断路径最后一段是否「看起来像文件」（带扩展名）。
 * 用于区分「静态文件请求」与「前端路由」，避免把 package.json 之类的请求回退成 HTML。
 */
function looksLikeFile(pathname) {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  return lastSegment.includes('.') && lastSegment !== '.' && lastSegment !== '..';
}

/**
 * 装配完整的 HTTP 应用：/api 路由 + 白名单静态资源 + 前端路由回退。
 * 不做任何监听动作，方便测试直接调用 app.request()。
 *
 * @param {object} deps
 * @param {ReturnType<typeof createStore>} [deps.store] 数据存储
 * @param {string} deps.rootDir 项目根目录（包含 index.html 与 assets/）
 */
export function createServerApp({ store = createStore(), rootDir } = {}) {
  if (typeof rootDir !== 'string' || rootDir.length === 0) {
    throw new Error('createServerApp 需要 rootDir 参数。');
  }

  const root = path.resolve(rootDir);
  const assetsRoot = path.join(root, 'assets');
  const indexHtmlPath = path.join(root, 'index.html');

  const app = new Hono();

  // 1) 接口优先，/api 下的未知路由由 createApp 内部返回 JSON 404
  app.route('/', createApp({ store }));

  // 2) 静态资源白名单：只允许 assets/ 目录，且必须落在该目录内
  app.get('/assets/*', (c) => {
    const { pathname } = new URL(c.req.url);

    let relative;
    try {
      relative = decodeURIComponent(pathname.slice('/assets/'.length));
    } catch {
      // 非法百分号编码
      return c.notFound();
    }

    if (relative.includes('\0')) return c.notFound();

    const target = path.resolve(assetsRoot, relative);
    // 目录穿越防护：解析后必须仍在 assets 目录内
    if (target !== assetsRoot && !target.startsWith(assetsRoot + path.sep)) {
      return c.notFound();
    }

    let fileBuffer;
    try {
      fileBuffer = readFileSync(target);
    } catch {
      return c.notFound();
    }

    return c.body(fileBuffer, 200, { 'content-type': mimeOf(target) });
  });

  // 3) 首页与前端路由回退：只有「不像文件」的路径才回 index.html
  app.get('*', (c) => {
    const { pathname } = new URL(c.req.url);
    if (pathname !== '/' && looksLikeFile(pathname)) {
      return c.notFound();
    }

    let html;
    try {
      html = readFileSync(indexHtmlPath, 'utf8');
    } catch {
      return c.text('index.html 不存在。', 500);
    }
    return c.html(html);
  });

  app.notFound((c) => c.text('Not Found', 404));

  app.onError((err, c) => {
    console.error('[server] 未处理的异常:', err);
    return c.text('服务器内部错误。', 500);
  });

  return app;
}
