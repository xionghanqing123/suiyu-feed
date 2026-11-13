# 碎语 · Mini Feed

一个极简社交动态页面：前端是**纯 HTML + CSS + JavaScript**（零框架、零构建），后端是 **Hono** 提供的 RESTful API，数据存放在**内存**中。

## 功能

- 发布动态：输入文字（上限 280 字，按 Unicode 码点计数，emoji 算 1 个字），实时字数统计，空内容不可发布
- 查看动态：按时间倒序展示，相对时间显示（刚刚 / x 分钟前 / 昨天 ...）
- 删除动态：单条动态可删除，带二次确认
- 服务端存储：数据由后端内存保管，刷新页面不丢失
- 快捷键：`Ctrl / Cmd + Enter` 快速发布
- 加载/错误状态提示与重试、空状态提示、响应式布局（移动端可用）

## 仓库地址

https://github.com/xionghanqing123/suiyu-feed

```bash
git clone https://github.com/xionghanqing123/suiyu-feed.git
```

## 目录结构

```
.
├── index.html            # 页面结构
├── assets/
│   ├── styles.css        # 样式
│   └── app.js            # 逻辑（调用 REST API、渲染、交互）
├── server/
│   ├── src/
│   │   ├── index.js      # 启动入口（端口、静态资源、监听）
│   │   ├── server.js     # 服务装配（API + 静态白名单）
│   │   ├── app.js        # /api 路由（Hono 应用）
│   │   ├── store.js      # 内存存储（工厂，可注入时钟与 id 生成器）
│   │   └── validate.js   # 入参校验规则
│   └── test/             # Vitest 测试（接口 / 存储健壮性 / 前端契约）
└── README.md
```

## 运行方式

```bash
npm install      # 安装 hono / @hono/node-server / vitest
npm start        # 启动服务，默认 http://localhost:3000
npm run dev      # 监听文件变化自动重启
npm test         # 运行接口测试
```

端口可通过环境变量覆盖：`PORT=8080 npm start`。

## 数据存储

数据保存在**进程内存**中，服务重启后清空。前端不再使用 Local Storage，所有读写都走接口。

### API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回 `{"status":"ok"}` |
| GET | `/api/posts` | 动态列表，按 `createdAt` 倒序，返回 `{"posts":[...]}` |
| POST | `/api/posts` | 发布动态，body `{"text":"...","author":"我"}`，成功 201 返回 `{"post":{...}}` |
| DELETE | `/api/posts/:id` | 删除动态，成功 200 返回 `{"deleted":true}`；不存在 404 |

单条动态结构：

```json
{
  "id": "0a1b2c3d-...",
  "author": "我",
  "text": "第一条动态",
  "createdAt": 1763000000000
}
```

### 错误响应

统一为 `{"error":{"code":"...","message":"中文说明"}}`，`message` 可直接展示给用户。

| 状态码 | code | 触发条件 |
| --- | --- | --- |
| 400 | `INVALID_TEXT` | 正文缺失、非字符串、去空白后为空 |
| 400 | `TEXT_TOO_LONG` | 正文去空白后超过 280 字 |
| 400 | `INVALID_AUTHOR` | 作者名非字符串或超过 32 字 |
| 400 | `INVALID_JSON` | 请求体不是合法 JSON |
| 404 | `NOT_FOUND` | 动态不存在或接口不存在 |
| 500 | `INTERNAL` | 未处理异常（不返回堆栈） |

长度按 Unicode 码点计算，emoji 不会被算成两个字符。

## 技术说明

- 后端只暴露 2 个 REST 资源路径（`/api/posts`、`/api/posts/:id`），校验逻辑集中在 `validate.js`
- 静态资源采用**白名单**：仅对外提供 `index.html` 与 `assets/`，源码、`package.json`、`node_modules` 等一律 404
- 删除接口幂等性语义为「删不到就 404」，前端删除失败时保留原条目，不会产生脏 UI
- 所有用户输入通过 `textContent` 写入 DOM，避免 XSS 注入
- 长度按 Unicode 码点计算：前端计数与后端校验口径一致，textarea 不再用 `maxlength` 做 UTF-16 码元截断
- 前端顺序完全信任服务端（最新在前），本地新建动态插入队首，避免同毫秒创建时二次排序打乱先后
- 接口测试覆盖：字段校验边界、倒序、默认作者、重复删除、未知路由、静态资源越权访问
- 健壮性测试覆盖：store 返回副本隔离、同时间戳稳定排序、特殊 id 删除、500 不泄漏堆栈、`text/plain` 容错、响应字段白名单
- 前端契约测试覆盖：无 Local Storage/Session Storage 依赖、调用 `/api/posts`、码点计数、无 `maxlength` 截断

## 许可

MIT
