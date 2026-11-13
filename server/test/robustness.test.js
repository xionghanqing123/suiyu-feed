import { describe, it, expect, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createStore } from '../src/store.js';

/** 构造 JSON 请求初始化参数 */
function jsonBody(method, payload) {
  return {
    method,
    headers: { 'content-type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  };
}

describe('内存存储的数据隔离', () => {
  it('修改 create() 的返回值不会污染内部数据', () => {
    const store = createStore({ now: () => 1, generateId: () => 'fixed' });
    const created = store.create({ text: '原始内容', author: '我' });

    created.text = '被外部篡改';
    created.author = '别人';

    expect(store.get('fixed')).toEqual({
      id: 'fixed',
      author: '我',
      text: '原始内容',
      createdAt: 1,
    });
  });

  it('修改 list() 返回的元素不会污染内部数据', () => {
    const store = createStore();
    const post = store.create({ text: '原始内容', author: '我' });

    const listed = store.list();
    listed[0].text = '被外部篡改';

    expect(store.list()[0].text).toBe('原始内容');
    expect(store.get(post.id).text).toBe('原始内容');
  });

  it('list() 每次返回新数组，外部 push 不影响存储', () => {
    const store = createStore();
    store.create({ text: '唯一一条', author: '我' });

    const first = store.list();
    const second = store.list();

    expect(first).not.toBe(second);
    first.push({ id: 'fake' });

    expect(store.list()).toHaveLength(1);
  });

  it('同一时间戳下创建的动态按「后创建在前」稳定排序', () => {
    let seq = 0;
    const store = createStore({
      now: () => 1000,
      generateId: () => `id-${++seq}`,
    });

    store.create({ text: '第一条', author: '我' });
    store.create({ text: '第二条', author: '我' });
    store.create({ text: '第三条', author: '我' });

    expect(store.list().map((p) => p.text)).toEqual(['第三条', '第二条', '第一条']);
  });
});

describe('REST 接口的健壮性', () => {
  it('DELETE 支持 URL 编码后的特殊 id', async () => {
    const specialId = 'a/b 中文';
    const app = createApp({
      store: createStore({ generateId: () => specialId }),
    });

    const created = await app.request('/api/posts', jsonBody('POST', { text: '特殊 id' }));
    expect(created.status).toBe(201);

    const res = await app.request('/api/posts/' + encodeURIComponent(specialId), {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });

    const list = await app.request('/api/posts');
    expect((await list.json()).posts).toHaveLength(0);
  });

  it('存储层抛错时返回 500 INTERNAL，且不泄漏堆栈', async () => {
    // 服务端会 console.error 打印堆栈给运维看，这里静音避免污染测试输出
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const brokenStore = {
      list() {
        throw new Error('boom at store.js:1:1');
      },
    };
    const app = createApp({ store: brokenStore });

    const res = await app.request('/api/posts');
    const text = await res.text();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();

    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({
      error: { code: 'INTERNAL', message: '服务器内部错误，请稍后再试。' },
    });
    expect(text).not.toContain('boom');
    expect(text).not.toContain('at store.js');
    expect(text).not.toContain('stack');
  });

  it('content-type 为 text/plain 但 body 是合法 JSON 时仍可创建', async () => {
    const app = createApp();

    const res = await app.request('/api/posts', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({ text: '纯文本头' }),
    });

    expect(res.status).toBe(201);
    expect((await res.json()).post.text).toBe('纯文本头');
  });

  it('GET /api/posts 返回的动态只包含四个公开字段', async () => {
    const app = createApp();
    await app.request('/api/posts', jsonBody('POST', { text: '字段检查' }));

    const res = await app.request('/api/posts');
    const { posts } = await res.json();

    expect(Object.keys(posts[0]).sort()).toEqual(['author', 'createdAt', 'id', 'text']);
  });
});
