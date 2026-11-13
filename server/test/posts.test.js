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

/**
 * 调用点赞 / 收藏接口。
 *
 * @param {string} kind 'like' 或 'favorite'
 * @param {object|string} payload 请求体
 */
function setFlag(app, id, kind, payload) {
  return requestJson(app, `/api/posts/${id}/${kind}`, jsonBody('PUT', payload));
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

describe('新建动态的点赞 / 收藏初始状态', () => {
  it('四个新字段初始为 0 / false', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '初始状态' });

    expect(post.likeCount).toBe(0);
    expect(post.liked).toBe(false);
    expect(post.favoriteCount).toBe(0);
    expect(post.favorited).toBe(false);
  });
});

describe('PUT /api/posts/:id/like', () => {
  it('点赞成功返回 200，likeCount 为 1 且 liked 为 true', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '值得点赞' });

    const { res, body } = await setFlag(app, post.id, 'like', { liked: true });

    expect(res.status).toBe(200);
    expect(body.post).toEqual({ ...post, likeCount: 1, liked: true });
  });

  it('重复点赞同一状态不会重复累加（幂等）', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '连点三次' });

    await setFlag(app, post.id, 'like', { liked: true });
    const second = await setFlag(app, post.id, 'like', { liked: true });
    const third = await setFlag(app, post.id, 'like', { liked: true });

    expect(second.body.post.likeCount).toBe(1);
    expect(third.body.post.likeCount).toBe(1);
    expect(third.body.post.liked).toBe(true);
  });

  it('取消点赞后计数回到 0，重复取消不会变成负数', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '点完再取消' });

    await setFlag(app, post.id, 'like', { liked: true });
    const off = await setFlag(app, post.id, 'like', { liked: false });
    const again = await setFlag(app, post.id, 'like', { liked: false });

    expect(off.body.post.likeCount).toBe(0);
    expect(off.body.post.liked).toBe(false);
    expect(again.body.post.likeCount).toBe(0);
    expect(again.body.post.liked).toBe(false);
  });

  it('点赞结果会被列表接口读到', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '列表同步' });

    await setFlag(app, post.id, 'like', { liked: true });

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts[0].likeCount).toBe(1);
    expect(body.posts[0].liked).toBe(true);
  });

  it('点赞不存在的 id → 404 NOT_FOUND', async () => {
    const { app } = setup();
    const { res, body } = await setFlag(app, 'does-not-exist', 'like', { liked: true });

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('liked 非布尔值 → 400 INVALID_STATE', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '类型校验' });

    for (const value of ['yes', 1, null, [], {}]) {
      const { res, body } = await setFlag(app, post.id, 'like', { liked: value });
      expect(res.status).toBe(400);
      expect(body.error.code).toBe('INVALID_STATE');
      expect(body.error.message).toContain('liked');
    }
  });

  it('liked 缺省 → 400 INVALID_STATE', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '缺字段' });

    const { res, body } = await setFlag(app, post.id, 'like', {});
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_STATE');
  });

  it('非法 JSON → 400 INVALID_JSON', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '坏 JSON' });

    const { res, body } = await setFlag(app, post.id, 'like', '{"liked": ');
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_JSON');
  });

  it('校验失败不会改动原有状态', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '失败不改状态' });

    await setFlag(app, post.id, 'like', { liked: true });
    await setFlag(app, post.id, 'like', { liked: 'yes' });

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts[0].likeCount).toBe(1);
    expect(body.posts[0].liked).toBe(true);
  });
});

describe('PUT /api/posts/:id/favorite', () => {
  it('收藏成功返回 200，favoriteCount 为 1 且 favorited 为 true', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '值得收藏' });

    const { res, body } = await setFlag(app, post.id, 'favorite', { favorited: true });

    expect(res.status).toBe(200);
    expect(body.post).toEqual({ ...post, favoriteCount: 1, favorited: true });
  });

  it('重复收藏同一状态不会重复累加（幂等）', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '收藏两次' });

    await setFlag(app, post.id, 'favorite', { favorited: true });
    const again = await setFlag(app, post.id, 'favorite', { favorited: true });

    expect(again.body.post.favoriteCount).toBe(1);
  });

  it('取消收藏后计数回到 0，重复取消不会变成负数', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '收藏再取消' });

    await setFlag(app, post.id, 'favorite', { favorited: true });
    const off = await setFlag(app, post.id, 'favorite', { favorited: false });
    const again = await setFlag(app, post.id, 'favorite', { favorited: false });

    expect(off.body.post.favoriteCount).toBe(0);
    expect(off.body.post.favorited).toBe(false);
    expect(again.body.post.favoriteCount).toBe(0);
  });

  it('收藏不存在的 id → 404 NOT_FOUND', async () => {
    const { app } = setup();
    const { res, body } = await setFlag(app, 'does-not-exist', 'favorite', { favorited: true });

    expect(res.status).toBe(404);
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('favorited 非布尔值 → 400 INVALID_STATE', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '收藏类型校验' });

    const { res, body } = await setFlag(app, post.id, 'favorite', { favorited: 'true' });
    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_STATE');
    expect(body.error.message).toContain('favorited');
  });
});

describe('点赞与收藏互不干扰', () => {
  it('点赞不会改收藏计数，收藏也不会改点赞计数', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '两个开关' });

    const liked = await setFlag(app, post.id, 'like', { liked: true });
    expect(liked.body.post.favoriteCount).toBe(0);
    expect(liked.body.post.favorited).toBe(false);

    const faved = await setFlag(app, post.id, 'favorite', { favorited: true });
    expect(faved.body.post.likeCount).toBe(1);
    expect(faved.body.post.liked).toBe(true);
    expect(faved.body.post.favoriteCount).toBe(1);
    expect(faved.body.post.favorited).toBe(true);
  });

  it('删除动态后其点赞 / 收藏状态一并消失', async () => {
    const { app } = setup();
    const post = await createPost(app, { text: '删掉' });

    await setFlag(app, post.id, 'like', { liked: true });
    await setFlag(app, post.id, 'favorite', { favorited: true });
    await requestJson(app, '/api/posts/' + post.id, { method: 'DELETE' });

    const { body } = await requestJson(app, '/api/posts');
    expect(body.posts).toEqual([]);
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

    expect(post).toEqual({
      id: 'fixed-id',
      text: '固定值',
      author: '我',
      createdAt: 42,
      likeCount: 0,
      liked: false,
      favoriteCount: 0,
      favorited: false,
    });
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
