# 碎语 · Mini Feed

一个使用**纯 HTML + CSS + JavaScript**（零框架、零依赖、零构建）实现的极简社交动态页面，支持发布与查看动态，数据保存在浏览器 **Local Storage** 中。

## 功能

- 发布动态：输入文字（上限 280 字），实时字数统计，空内容不可发布
- 查看动态：按时间倒序展示，相对时间显示（刚刚 / x 分钟前 / 昨天 ...）
- 删除动态：单条动态可删除，带二次确认
- 本地持久化：刷新或关闭浏览器后数据依然保留
- 快捷键：`Ctrl / Cmd + Enter` 快速发布
- 空状态提示、响应式布局（移动端可用）

## 仓库地址

https://github.com/xionghanqing123/suiyu-feed

```bash
git clone https://github.com/xionghanqing123/suiyu-feed.git
```

## 目录结构

```
.
├── index.html        # 页面结构
├── assets/
│   ├── styles.css    # 样式
│   └── app.js        # 逻辑（Local Storage 读写、渲染、交互）
└── README.md
```

## 运行方式

方式一：直接双击 `index.html` 用浏览器打开。

方式二：启动本地静态服务器（推荐）：

```bash
# Python 3
python -m http.server 8000

# 或 Node.js
npx serve .
```

然后访问 http://localhost:8000

## 数据存储

数据以 JSON 数组形式保存在 `localStorage` 的 `suiyu.posts.v1` 键下，结构示例：

```json
[
  {
    "id": "0a1b2c3d",
    "author": "我",
    "text": "第一条动态",
    "createdAt": 1763000000000
  }
]
```

清空数据可在浏览器控制台执行：`localStorage.removeItem('suiyu.posts.v1')`。

## 技术说明

- 无任何第三方库与网络请求，可离线使用
- 所有用户输入通过 `textContent` 写入 DOM，避免 XSS 注入
- 读取存储时做了容错处理，数据损坏会自动降级为空列表并给出警告

## 许可

MIT
