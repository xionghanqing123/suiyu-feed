/**
 * 发布动态的入参校验规则集中在此处，避免校验逻辑散落在路由里。
 */

/** 动态正文长度上限 */
export const MAX_TEXT_LENGTH = 280;

/** 作者名长度上限 */
export const MAX_AUTHOR_LENGTH = 32;

/** 作者名缺省值 */
export const DEFAULT_AUTHOR = '我';

/** 构造失败结果 */
function fail(code, message) {
  return { ok: false, error: { code, message } };
}

/** 按 Unicode 码点计长度，避免 emoji 被算成两个字符 */
function countChars(value) {
  return Array.from(value).length;
}

/**
 * 校验并规范化创建动态的入参。
 *
 * @param {unknown} raw 已解析的请求体
 * @returns {{ok: true, value: {text: string, author: string}}
 *          | {ok: false, error: {code: string, message: string}}}
 */
export function validatePostInput(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return fail('INVALID_TEXT', '请求体必须是一个 JSON 对象。');
  }

  // 正文：必须是字符串，去首尾空白后非空，且不超过上限
  if (typeof raw.text !== 'string') {
    return fail('INVALID_TEXT', '动态内容必须是非空文本。');
  }

  const text = raw.text.trim();
  const textLength = countChars(text);

  if (textLength === 0) {
    return fail('INVALID_TEXT', '动态内容不能为空。');
  }

  if (textLength > MAX_TEXT_LENGTH) {
    return fail(
      'TEXT_TOO_LONG',
      `动态内容最多 ${MAX_TEXT_LENGTH} 个字，当前 ${textLength} 个字。`
    );
  }

  // 作者：缺省或纯空白时使用默认值，非字符串或超长则拒绝
  let author = DEFAULT_AUTHOR;
  if (raw.author !== undefined && raw.author !== null) {
    if (typeof raw.author !== 'string') {
      return fail('INVALID_AUTHOR', '作者名必须是非空文本。');
    }
    const trimmedAuthor = raw.author.trim();
    if (trimmedAuthor.length > 0) {
      if (countChars(trimmedAuthor) > MAX_AUTHOR_LENGTH) {
        return fail(
          'INVALID_AUTHOR',
          `作者名最多 ${MAX_AUTHOR_LENGTH} 个字，当前 ${countChars(trimmedAuthor)} 个字。`
        );
      }
      author = trimmedAuthor;
    }
  }

  return { ok: true, value: { text, author } };
}
