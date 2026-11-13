import { describe, it, expect } from 'vitest';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

/**
 * 辅助：每个用例都新建独立的 store 与 app，保证用例之间互不污染。
 */
function setup(options) {
  const store = createStore(options);
  const app = createApp({ store });
  return { app, store };
}

async function requestJson(app, path, init) {
  const res = await app.request(path, init);
  const body = await res.json();
  return { res, body };
}

/** 构造 JSON 请求初始化参数 */
function jsonBody(method, payload) {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

/** 创建一条动态并返回响应体中的 post */
async function createPost(app, payload) {
  const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', payload));
  expect(res.status).toBe(201);
  return body.post;
}

describe('GET /api/health', () => {
  it('返回 200 与 {status:"ok"}', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/health');

    expect(res.status).toBe(200);
    expect(body).toEqual({ status: 'ok' });
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});

describe('GET /api/posts', () => {
  it('初始列表为空数组', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts');

    expect(res.status).toBe(200);
    expect(body).toEqual({ posts: [] });
    expect(Array.isArray(body.posts)).toBe(true);
  });

  it('按 createdAt 倒序返回（最新在前）', async () => {
    // 注入递增时钟，保证时间戳确定
    let tick = 1000;
    const { app } = setup({ now: () => (tick += 1000) });

    const first = await createPost(app, { text: '第一条' });
    const second = await createPost(app, { text: '第二条' });
    const third = await createPost(app, { text: '第三条' });

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts.map((p) => p.text)).toEqual(['第三条', '第二条', '第一条']);
    expect(body.posts.map((p) => p.id)).toEqual([third.id, second.id, first.id]);
    expect(body.posts[0].createdAt).toBeGreaterThan(body.posts[1].createdAt);
  });
});

describe('POST /api/posts', () => {
  it('创建成功返回 201，字段完整且 createdAt 为数字', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(
      app,
      '/api/posts',
      jsonBody('POST', { text: '今天也在写代码', author: '小明' })
    );

    expect(res.status).toBe(201);
    expect(typeof body.post.id).toBe('string');
    expect(body.post.id.length).toBeGreaterThan(0);
    expect(body.post.author).toBe('小明');
    expect(body.post.text).toBe('今天也在写代码');
    expect(typeof body.post.createdAt).toBe('number');
    expect(Number.isFinite(body.post.createdAt)).toBe(true);
  });

  it('text 首尾空白会被去除后保存', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '  前后都有空格  \n' });

    expect(post.text).toBe('前后都有空格');

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts[0].text).toBe('前后都有空格');
  });

  it('author 缺省时默认 "我"', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '没有作者字段' });

    expect(post.author).toBe('我');
  });

  it('author 为纯空白时同样默认为 "我"', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '空白作者', author: '   ' });

    expect(post.author).toBe('我');
  });

  it('恰好 280 字可以创建成功', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: 'a'.repeat(280) });

    expect(post.text.length).toBe(280);
  });

  it('280 个 emoji 可以创建成功（按 Unicode 码点计数）', async () => {
    const { app } = setup();
    const text = '😀'.repeat(280);
    const post = await createPost(app, { text });

    expect(Array.from(post.text)).toHaveLength(280);
  });

  it('281 个 emoji → 400 TEXT_TOO_LONG', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(
      app,
      '/api/posts',
      jsonBody('POST', { text: '😀'.repeat(281) })
    );

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('TEXT_TOO_LONG');
  });

  it('text 缺失 → 400 INVALID_TEXT', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', { author: '小明' }));

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_TEXT');
    expect(typeof body.error.message).toBe('string');
    expect(body.error.message.length).toBeGreaterThan(0);
  });

  it('text 为空串 → 400 INVALID_TEXT', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', { text: '' }));

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_TEXT');
  });

  it('text 为纯空白 → 400 INVALID_TEXT', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', { text: '   \n\t ' }));

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_TEXT');
  });

  it('text 非字符串 → 400 INVALID_TEXT', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', { text: 123 }));

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_TEXT');
  });

  it('text 超过 280 字 → 400 TEXT_TOO_LONG，message 含上限 280', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(
      app,
      '/api/posts',
      jsonBody('POST', { text: 'a'.repeat(281) })
    );

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('TEXT_TOO_LONG');
    expect(body.error.message).toContain('280');
  });

  it('author 超过 32 字 → 400 INVALID_AUTHOR', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(
      app,
      '/api/posts',
      jsonBody('POST', { text: '正常内容', author: 'b'.repeat(33) })
    );

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_AUTHOR');
    expect(typeof body.error.message).toBe('string');
  });

  it('非法 JSON → 400 INVALID_JSON', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', jsonBody('POST', '{"text": '));

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
    expect(typeof body.error.message).toBe('string');
  });

  it('校验失败时不会写入数据', async () => {
    const { app } = setup();
    await requestJson(app, '/api/posts', jsonBody('POST', { text: '   ' }));

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts).toEqual([]);
  });
});

describe('DELETE /api/posts/:id', () => {
  it('删除成功返回 200 {deleted:true}，列表中不再包含', async () => {
    const { app } = setup();
    const keep = await createPost(app, { text: '保留' });
    const drop = await createPost(app, { text: '删除' });

    const { res, body } = await requestJson(app, '/api/posts/' + drop.id, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(body).toEqual({ deleted: true });

    const list = await requestJson(app, '/api/posts');
    const ids = list.body.posts.map((p) => p.id);
    expect(ids).not.toContain(drop.id);
    expect(ids).toContain(keep.id);
    expect(list.body.posts).toHaveLength(1);
  });

  it('删除不存在的 id → 404 NOT_FOUND', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts/does-not-exist', { method: 'DELETE' });

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
    expect(typeof body.error.message).toBe('string');
  });

  it('重复删除同一个 id，第二次返回 404', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '只删一次' });

    const first = await requestJson(app, '/api/posts/' + post.id, { method: 'DELETE' });
    expect(first.res.status).toBe(200);

    const second = await requestJson(app, '/api/posts/' + post.id, { method: 'DELETE' });
    expect(second.res.status).toBe(404);
    expect(second.body.error.code).toBe('NOT_FOUND');
  });
});

describe('未知 /api 路由', () => {
  it('GET /api/unknown → 404 NOT_FOUND', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/unknown');

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('PUT /api/posts → 404 NOT_FOUND', async () => {
    const { app } = setup();
    const { res, body } = await requestJson(app, '/api/posts', { method: 'PUT' });

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});

describe('store 工厂', () => {
  it('支持注入 id 生成器与时钟', () => {
    const store = createStore({ now: () => 42, generateId: () => 'fixed-id' });
    const post = store.create({ text: '固定值', author: '我' });

    expect(post).toEqual({ id: 'fixed-id', text: '固定值', author: '我', createdAt: 42 });
    expect(store.get('fixed-id')).toEqual(post);
    expect(store.list()).toHaveLength(1);
    expect(store.remove('fixed-id')).toBe(true);
    expect(store.list()).toHaveLength(0);
    expect(store.get('fixed-id')).toBeNull();
  });

  it('两个 store 实例互不影响', () => {
    const a = createStore();
    const b = createStore();
    a.create({ text: '只在 A', author: '我' });

    expect(a.list()).toHaveLength(1);
    expect(b.list()).toHaveLength(0);
  });
});
