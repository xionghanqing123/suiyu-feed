import { randomUUID } from 'node:crypto';

/**
 * 创建纯内存的动态存储。
 * 不做模块级共享状态，所有数据都闭包在实例内部，便于测试注入与重置。
 *
 * @param {object} [options]
 * @param {() => number} [options.now] 时间戳生成函数，默认 Date.now
 * @param {() => string} [options.generateId] id 生成函数，默认 crypto.randomUUID
 */
export function createStore(options = {}) {
  const now = typeof options.now === 'function' ? options.now : () => Date.now();
  const generateId =
    typeof options.generateId === 'function' ? options.generateId : () => randomUUID();

  /** @type {Map<string, {post: {id: string, author: string, text: string, createdAt: number}, sequence: number}>} */
  const records = new Map();
  let sequence = 0;

  /** 返回副本，避免调用方改到内部数据 */
  function toPost(record) {
    return { ...record.post };
  }

  return {
    /** 按 createdAt 倒序返回全部动态（同一时间戳时后创建的在前） */
    list() {
      return [...records.values()]
        .sort((a, b) => b.post.createdAt - a.post.createdAt || b.sequence - a.sequence)
        .map(toPost);
    },

    /** 按 id 取单条，不存在返回 null */
    get(id) {
      const record = records.get(id);
      return record ? toPost(record) : null;
    },

    /** 新建一条动态，入参应已通过校验 */
    create({ text, author }) {
      sequence += 1;
      const post = {
        id: generateId(),
        author,
        text,
        createdAt: now(),
      };
      records.set(post.id, { post, sequence });
      return { ...post };
    },

    /** 删除一条动态，返回是否真的删掉了 */
    remove(id) {
      return records.delete(id);
    },
  };
}
