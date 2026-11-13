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

  /**
   * @type {Map<string, {post: {
   *   id: string, author: string, text: string, createdAt: number,
   *   likeCount: number, liked: boolean, favoriteCount: number, favorited: boolean
   * }, sequence: number}>}
   */
  const records = new Map();
  let sequence = 0;

  /** 返回副本，避免调用方改到内部数据（字段全是标量，逐个拷贝即可） */
  function toPost(record) {
    const { post } = record;
    return {
      id: post.id,
      author: post.author,
      text: post.text,
      createdAt: post.createdAt,
      likeCount: post.likeCount,
      liked: post.liked,
      favoriteCount: post.favoriteCount,
      favorited: post.favorited,
    };
  }

  /**
   * 点赞 / 收藏共用的状态切换逻辑。
   *
   * @param {string} id 动态 id
   * @param {'liked'|'favorited'} flagField 布尔状态字段名
   * @param {'likeCount'|'favoriteCount'} countField 计数字段名
   * @param {boolean} next 目标状态
   */
  function setFlag(id, flagField, countField, next) {
    const record = records.get(id);
    if (!record) return null;

    const { post } = record;
    if (post[flagField] === next) {
      // 幂等：状态没变化就不动计数
      return toPost(record);
    }

    post[flagField] = next;
    post[countField] = Math.max(0, post[countField] + (next ? 1 : -1));
    return toPost(record);
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
        likeCount: 0,
        liked: false,
        favoriteCount: 0,
        favorited: false,
      };
      records.set(post.id, { post, sequence });
      return toPost(records.get(post.id));
    },

    /** 删除一条动态，返回是否真的删掉了 */
    remove(id) {
      return records.delete(id);
    },

    /**
     * 显式设置「当前用户」的点赞状态，幂等：重复设置同一状态不会改变计数。
     * 计数只在 false → true 时 +1、true → false 时 -1，且永不为负。
     *
     * @param {string} id 动态 id
     * @param {boolean} liked 目标状态
     * @returns {ReturnType<typeof toPost> | null} 动态不存在时返回 null
     */
    setLike(id, liked) {
      return setFlag(id, 'liked', 'likeCount', liked);
    },

    /**
     * 显式设置「当前用户」的收藏状态，语义与 setLike 一致。
     *
     * @param {string} id 动态 id
     * @param {boolean} favorited 目标状态
     * @returns {ReturnType<typeof toPost> | null} 动态不存在时返回 null
     */
    setFavorite(id, favorited) {
      return setFlag(id, 'favorited', 'favoriteCount', favorited);
    },
  };
}
