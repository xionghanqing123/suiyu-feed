(function () {
  'use strict';

  var MAX_LEN = 280;
  var DEFAULT_AUTHOR = '我';
  var API_POSTS = '/api/posts';

  var form = document.getElementById('composerForm');
  var input = document.getElementById('postText');
  var submitBtn = document.getElementById('submitBtn');
  var counter = document.getElementById('charCounter');
  var feed = document.getElementById('feed');
  var feedWrap = feed.parentNode;
  var emptyState = document.getElementById('emptyState');
  var emptyTitle = document.getElementById('emptyTitle');
  var emptyDesc = document.getElementById('emptyDesc');
  var postCount = document.getElementById('postCount');
  var filterAll = document.getElementById('filterAll');
  var filterFavorites = document.getElementById('filterFavorites');
  var favoriteBadge = document.getElementById('favoriteBadge');

  /* ---------------- 状态提示条（加载中 / 错误） ---------------- */

  var statusEl = document.createElement('div');
  statusEl.className = 'feed-status';
  statusEl.setAttribute('role', 'status');
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.hidden = true;

  var statusText = document.createElement('span');
  statusText.className = 'feed-status-text';

  var retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.className = 'feed-status-retry';
  retryBtn.textContent = '重试';
  retryBtn.hidden = true;
  retryBtn.addEventListener('click', function () {
    loadPosts();
  });

  statusEl.appendChild(statusText);
  statusEl.appendChild(retryBtn);
  feedWrap.insertBefore(statusEl, feed);

  function showLoading() {
    statusEl.className = 'feed-status';
    statusText.textContent = '正在加载动态…';
    retryBtn.hidden = true;
    statusEl.hidden = false;
  }

  function showError(message, canRetry) {
    statusEl.className = 'feed-status is-error';
    statusText.textContent = message;
    retryBtn.hidden = !canRetry;
    statusEl.hidden = false;
  }

  function hideStatus() {
    statusEl.hidden = true;
    statusText.textContent = '';
    retryBtn.hidden = true;
  }

  /* ---------------- 数据层（后端 REST 接口） ---------------- */

  function buildError(data, status) {
    var payload = data && data.error ? data.error : null;
    var message = payload && typeof payload.message === 'string' && payload.message
      ? payload.message
      : '请求失败（HTTP ' + status + '）';
    var err = new Error(message);
    err.status = status;
    err.code = payload && payload.code ? payload.code : null;
    return err;
  }

  /**
   * 统一的接口请求封装：同源相对路径，非 2xx 解析 error.message 后抛出。
   */
  function apiRequest(method, path, body) {
    if (typeof window.fetch !== 'function') {
      return Promise.reject(new Error('当前浏览器不支持 fetch，请更换较新的浏览器。'));
    }

    var options = {
      method: method,
      headers: { Accept: 'application/json' }
    };

    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    return window.fetch(path, options).then(function (res) {
      if (res.ok) {
        return res.json().then(function (data) {
          return data;
        }, function () {
          return null;
        });
      }

      return res.json().then(function (data) {
        throw buildError(data, res.status);
      }, function () {
        throw buildError(null, res.status);
      });
    }, function () {
      throw new Error('无法连接服务器，请确认本地后端服务已启动。');
    });
  }

  /** 计数类字段兜底：非法值一律当 0，且保证是非负整数 */
  function toCount(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return 0;
    return Math.floor(n);
  }

  /**
   * 统一整理服务端返回的字段，保证视图层拿到 id/author/text/createdAt
   * 以及点赞 / 收藏四个字段的稳定类型。
   */
  function normalizePost(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (typeof raw.text !== 'string') return null;

    var createdAt = raw.createdAt;
    if (typeof createdAt === 'string') {
      var parsed = Date.parse(createdAt);
      createdAt = isNaN(parsed) ? Date.now() : parsed;
    }
    if (typeof createdAt !== 'number' || !isFinite(createdAt)) {
      createdAt = Date.now();
    }

    return {
      id: raw.id === null || raw.id === undefined ? '' : String(raw.id),
      author: typeof raw.author === 'string' && raw.author ? raw.author : DEFAULT_AUTHOR,
      text: raw.text,
      createdAt: createdAt,
      likeCount: toCount(raw.likeCount),
      liked: raw.liked === true,
      favoriteCount: toCount(raw.favoriteCount),
      favorited: raw.favorited === true
    };
  }

  function fetchPosts() {
    return apiRequest('GET', API_POSTS).then(function (data) {
      var list = null;
      if (data && Array.isArray(data.posts)) {
        list = data.posts;
      } else if (Array.isArray(data)) {
        list = data;
      }
      if (!list) throw new Error('服务端返回的数据格式不正确。');

      var cleaned = [];
      for (var i = 0; i < list.length; i++) {
        var post = normalizePost(list[i]);
        if (post) cleaned.push(post);
      }
      return cleaned;
    });
  }

  function createPost(text) {
    return apiRequest('POST', API_POSTS, {
      text: text,
      author: DEFAULT_AUTHOR
    }).then(function (data) {
      var post = normalizePost(data ? data.post : null);
      if (!post) throw new Error('服务端未返回新建的动态内容。');
      return post;
    });
  }

  function deletePost(id) {
    return apiRequest('DELETE', API_POSTS + '/' + encodeURIComponent(id));
  }

  /* ---------------- 点赞 / 收藏 ---------------- */

  /** 用服务端返回的最新数据就地更新列表里的同一条动态（保持对象引用不变） */
  function applyPost(updated) {
    for (var i = 0; i < posts.length; i++) {
      if (posts[i].id !== updated.id) continue;
      posts[i].author = updated.author;
      posts[i].text = updated.text;
      posts[i].createdAt = updated.createdAt;
      posts[i].likeCount = updated.likeCount;
      posts[i].liked = updated.liked;
      posts[i].favoriteCount = updated.favoriteCount;
      posts[i].favorited = updated.favorited;
      return;
    }
  }

  /**
   * 切换点赞 / 收藏：先乐观更新 UI，再用服务端返回的数据校正，失败则回滚。
   * 请求里显式传目标布尔值（不是 toggle），接口幂等，重试不会重复累加。
   */
  function toggleFlag(post, kind) {
    var isLike = kind === 'like';
    var field = isLike ? 'liked' : 'favorited';
    var countField = isLike ? 'likeCount' : 'favoriteCount';
    var label = isLike ? '点赞' : '收藏';
    var pendingKey = post.id + ':' + kind;

    if (pendingActions[pendingKey]) return;

    var target = post[field] !== true;
    var previous = { active: post[field], count: post[countField] };

    post[field] = target;
    post[countField] = Math.max(0, post[countField] + (target ? 1 : -1));
    pendingActions[pendingKey] = true;
    render();

    var payload = isLike ? { liked: target } : { favorited: target };
    var path = API_POSTS + '/' + encodeURIComponent(post.id) + (isLike ? '/like' : '/favorite');

    apiRequest('PUT', path, payload).then(function (data) {
      var updated = normalizePost(data ? data.post : null);
      if (!updated) throw new Error('服务端未返回更新后的动态内容。');
      applyPost(updated);
      delete pendingActions[pendingKey];
      hideStatus();
      render();
    }, function (err) {
      // 失败回滚到点击前的状态，避免脏 UI
      post[field] = previous.active;
      post[countField] = previous.count;
      delete pendingActions[pendingKey];
      render();
      showError(label + '失败：' + err.message, false);
    });
  }

  var posts = [];
  var hasLoaded = false;
  var isSubmitting = false;
  // 'all' 或 'favorites'：全量数据都在内存里，筛选纯前端完成
  var currentFilter = 'all';
  // 请求飞行中的点赞 / 收藏按钮，key 为 `id:kind`，防止连点导致计数错乱
  var pendingActions = {};

  /**
   * 按 Unicode 码点计数，与后端 validate.js 的口径保持一致，
   * 这样 emoji 不会被算成两个字符。
   */
  function countChars(value) {
    return Array.from(value).length;
  }

  function loadPosts() {
    showLoading();
    return fetchPosts().then(function (list) {
      posts = list;
      hasLoaded = true;
      hideStatus();
      render();
    }, function (err) {
      hasLoaded = false;
      render();
      showError('加载失败：' + err.message, true);
    });
  }

  /* ---------------- 视图层 ---------------- */

  function formatTime(timestamp) {
    var diff = Date.now() - timestamp;
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + ' 小时前';

    var date = new Date(timestamp);
    var now = new Date();
    var sameYear = date.getFullYear() === now.getFullYear();
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };

    if (diff < 48 * 60 * 60 * 1000) return '昨天 ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    return (sameYear ? '' : date.getFullYear() + '-') +
      pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
      ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  /**
   * 构造点赞 / 收藏按钮：图标随状态切换，aria-pressed 反映当前状态，
   * 数量为 0 时也照常显示，避免布局跳动。
   */
  function buildFlagButton(post, kind) {
    var isLike = kind === 'like';
    var active = isLike ? post.liked === true : post.favorited === true;
    var count = isLike ? post.likeCount : post.favoriteCount;
    var label = isLike ? '点赞' : '收藏';
    var icon = isLike ? (active ? '♥' : '♡') : (active ? '★' : '☆');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-flag btn-' + kind + (active ? ' is-active' : '');
    btn.dataset.kind = kind;
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('aria-label', label + '，当前 ' + count + ' 个');
    btn.disabled = pendingActions[post.id + ':' + kind] === true;

    var iconEl = document.createElement('span');
    iconEl.className = 'flag-icon';
    iconEl.setAttribute('aria-hidden', 'true');
    iconEl.textContent = icon;

    var countEl = document.createElement('span');
    countEl.className = 'flag-count';
    countEl.textContent = String(count);

    btn.appendChild(iconEl);
    btn.appendChild(countEl);
    btn.addEventListener('click', function () {
      toggleFlag(post, kind);
    });

    return btn;
  }

  function buildPostItem(post) {
    var li = document.createElement('li');
    li.className = 'post';
    li.dataset.id = post.id;

    var head = document.createElement('div');
    head.className = 'post-head';

    var avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = (post.author || '匿').charAt(0);

    var meta = document.createElement('div');
    meta.className = 'post-meta';

    var name = document.createElement('div');
    name.className = 'post-name';
    name.textContent = post.author || '匿名';

    var time = document.createElement('div');
    time.className = 'post-time';
    time.textContent = formatTime(post.createdAt);
    time.title = new Date(post.createdAt).toLocaleString('zh-CN');

    meta.appendChild(name);
    meta.appendChild(time);
    head.appendChild(avatar);
    head.appendChild(meta);

    var body = document.createElement('p');
    body.className = 'post-body';
    body.textContent = post.text;

    var actions = document.createElement('div');
    actions.className = 'post-actions';

    // 左侧：点赞 / 收藏
    var reactions = document.createElement('div');
    reactions.className = 'post-reactions';
    reactions.appendChild(buildFlagButton(post, 'like'));
    reactions.appendChild(buildFlagButton(post, 'favorite'));

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-delete';
    delBtn.textContent = '删除';
    delBtn.setAttribute('aria-label', '删除这条动态');
    delBtn.addEventListener('click', function () {
      removePost(post.id, delBtn);
    });

    actions.appendChild(reactions);
    actions.appendChild(delBtn);
    li.appendChild(head);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  function visiblePosts() {
    if (currentFilter !== 'favorites') return posts;
    return posts.filter(function (post) {
      return post.favorited === true;
    });
  }

  function render() {
    feed.textContent = '';
    // 顺序以服务端为准（最新在前），本地新建的动态插到队首，避免二次排序打乱同毫秒的先后
    var shown = visiblePosts();
    shown.forEach(function (post) {
      feed.appendChild(buildPostItem(post));
    });

    // 顶部的「N 条动态」始终是总数，不受筛选影响
    postCount.textContent = String(posts.length);

    var favoriteTotal = 0;
    posts.forEach(function (post) {
      if (post.favorited === true) favoriteTotal += 1;
    });
    favoriteBadge.textContent = String(favoriteTotal);

    var isEmpty = hasLoaded && shown.length === 0;
    emptyState.hidden = !isEmpty;
    if (isEmpty) {
      if (currentFilter === 'favorites') {
        emptyTitle.textContent = '还没有收藏任何动态';
        emptyDesc.textContent = '点击动态下方的 ☆ 即可收藏，收藏后会出现在这里。';
      } else {
        emptyTitle.textContent = '还没有任何动态';
        emptyDesc.textContent = '在上方输入一段文字，点击「发布」开始记录。';
      }
    }
  }

  /** 切换「全部 / 收藏」筛选，纯前端过滤，不额外请求接口 */
  function setFilter(filter) {
    currentFilter = filter === 'favorites' ? 'favorites' : 'all';

    var isAll = currentFilter === 'all';
    filterAll.classList.toggle('is-active', isAll);
    filterFavorites.classList.toggle('is-active', !isAll);
    filterAll.setAttribute('aria-pressed', isAll ? 'true' : 'false');
    filterFavorites.setAttribute('aria-pressed', isAll ? 'false' : 'true');

    render();
  }

  /* ---------------- 交互 ---------------- */

  function updateCounter() {
    var len = countChars(input.value);
    counter.textContent = len + ' / ' + MAX_LEN;
    counter.classList.toggle('is-warning', len > MAX_LEN - 20 && len <= MAX_LEN);
    counter.classList.toggle('is-over', len > MAX_LEN);
    submitBtn.disabled = isSubmitting || input.value.trim() === '' || len > MAX_LEN;
  }

  function setSubmitting(pending) {
    isSubmitting = pending;
    submitBtn.setAttribute('aria-busy', pending ? 'true' : 'false');
    updateCounter();
  }

  function publish() {
    var text = input.value.trim();
    if (!text) return;
    if (countChars(text) > MAX_LEN) {
      alert('内容超过 ' + MAX_LEN + ' 字上限。');
      return;
    }
    if (isSubmitting) return;

    setSubmitting(true);
    createPost(text).then(function (post) {
      posts.unshift(post);
      hideStatus();
      render();

      input.value = '';
      updateCounter();
      input.focus();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, function (err) {
      // 失败时保留输入内容与列表原状，避免脏 UI
      showError('发布失败：' + err.message, false);
    }).then(function () {
      setSubmitting(false);
    });
  }

  function removePost(id, delBtn) {
    if (!window.confirm('确定删除这条动态吗？')) return;

    if (delBtn) delBtn.disabled = true;
    deletePost(id).then(function () {
      posts = posts.filter(function (p) { return p.id !== id; });
      hideStatus();
      render();
    }, function (err) {
      // 失败时条目保留在列表中
      if (delBtn) delBtn.disabled = false;
      showError('删除失败：' + err.message, false);
    });
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    publish();
  });

  input.addEventListener('input', updateCounter);

  input.addEventListener('keydown', function (event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      if (!submitBtn.disabled) publish();
    }
  });

  filterAll.addEventListener('click', function () {
    setFilter('all');
  });

  filterFavorites.addEventListener('click', function () {
    setFilter('favorites');
  });

  updateCounter();
  loadPosts();
})();
