(function () {
  'use strict';

  var STORAGE_KEY = 'suiyu.posts.v1';
  var MAX_LEN = 280;
  var DEFAULT_AUTHOR = '我';

  var form = document.getElementById('composerForm');
  var input = document.getElementById('postText');
  var submitBtn = document.getElementById('submitBtn');
  var counter = document.getElementById('charCounter');
  var feed = document.getElementById('feed');
  var emptyState = document.getElementById('emptyState');
  var postCount = document.getElementById('postCount');

  /* ---------------- 数据层 ---------------- */

  function loadPosts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(function (p) {
        return p && typeof p.text === 'string' && typeof p.createdAt === 'number';
      });
    } catch (err) {
      console.warn('读取本地数据失败，已重置为初始状态。', err);
      return [];
    }
  }

  function savePosts(posts) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch (err) {
      console.error('保存到 Local Storage 失败：', err);
      alert('保存失败，可能是浏览器存储空间不足或被禁用。');
    }
  }

  function createPost(text) {
    var id;
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      id = window.crypto.randomUUID();
    } else {
      id = String(Date.now()) + '-' + Math.random().toString(16).slice(2, 8);
    }
    return {
      id: id,
      author: DEFAULT_AUTHOR,
      text: text,
      createdAt: Date.now()
    };
  }

  var posts = loadPosts();

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

    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-delete';
    delBtn.textContent = '删除';
    delBtn.setAttribute('aria-label', '删除这条动态');
    delBtn.addEventListener('click', function () {
      removePost(post.id);
    });

    actions.appendChild(delBtn);
    li.appendChild(head);
    li.appendChild(body);
    li.appendChild(actions);
    return li;
  }

  function render() {
    feed.textContent = '';
    var sorted = posts.slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
    sorted.forEach(function (post) {
      feed.appendChild(buildPostItem(post));
    });

    emptyState.hidden = sorted.length > 0;
    postCount.textContent = String(sorted.length);
  }

  /* ---------------- 交互 ---------------- */

  function updateCounter() {
    var len = input.value.length;
    counter.textContent = len + ' / ' + MAX_LEN;
    counter.classList.toggle('is-warning', len > MAX_LEN - 20 && len <= MAX_LEN);
    counter.classList.toggle('is-over', len > MAX_LEN);
    submitBtn.disabled = input.value.trim().length === 0 || len > MAX_LEN;
  }

  function publish() {
    var text = input.value.trim();
    if (!text) return;
    if (text.length > MAX_LEN) {
      alert('内容超过 ' + MAX_LEN + ' 字上限。');
      return;
    }

    posts.push(createPost(text));
    savePosts(posts);
    render();

    input.value = '';
    updateCounter();
    input.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function removePost(id) {
    if (!window.confirm('确定删除这条动态吗？')) return;
    posts = posts.filter(function (p) { return p.id !== id; });
    savePosts(posts);
    render();
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

  updateCounter();
  render();
})();
