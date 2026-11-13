import { Hono } from 'hono';
import { createStore } from './store.js';
import { validatePostInput } from './validate.js';

/** 统一的错误响应结构 */
function errorResponse(c, status, code, message) {
  return c.json({ error: { code, message } }, status);
}

/** /api 下未匹配到路由时的 404 */
function notFound(c) {
  return errorResponse(c, 404, 'NOT_FOUND', '接口不存在。');
}

/**
 * 创建只挂载 /api 路由的 Hono 应用，便于测试时直接调用 app.request()。
 *
 * @param {object} [deps]
 * @param {ReturnType<typeof createStore>} [deps.store] 数据存储，默认新建内存实例
 */
export function createApp({ store = createStore() } = {}) {
  const app = new Hono();

  // 健康检查
  app.get('/api/health', (c) => c.json({ status: 'ok' }));

  // 动态列表：最新在前
  app.get('/api/posts', (c) => c.json({ posts: store.list() }));

  // 发布动态
  app.post('/api/posts', async (c) => {
    let raw;
    try {
      // 用 text() + JSON.parse 而不是 c.req.json()，这样 content-type 不规范时也能正确判断
      raw = JSON.parse(await c.req.text());
    } catch {
      return errorResponse(c, 400, 'INVALID_JSON', '请求体不是合法的 JSON。');
    }

    const result = validatePostInput(raw);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    const post = store.create(result.value);
    return c.json({ post }, 201);
  });

  // 删除动态
  app.delete('/api/posts/:id', (c) => {
    const id = c.req.param('id');
    if (!store.remove(id)) {
      return errorResponse(c, 404, 'NOT_FOUND', '要删除的动态不存在。');
    }
    return c.json({ deleted: true });
  });

  // /api 下的兜底 404
  app.all('/api', notFound);
  app.all('/api/*', notFound);
  app.notFound(notFound);

  // 异常兜底，避免把堆栈暴露给前端
  app.onError((err, c) => {
    console.error('[api] 未处理的异常:', err);
    return errorResponse(c, 500, 'INTERNAL', '服务器内部错误，请稍后再试。');
  });

  return app;
}
