import { serve } from '@hono/node-server';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServerApp } from './server.js';
import { createStore } from './store.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// 项目根目录：server/src 往上两级
const rootDir = path.resolve(currentDir, '../..');

// 装配完整应用：/api 路由 + 静态资源 + 前端路由回退
const app = createServerApp({ store: createStore(), rootDir });

const port = Number(process.env.PORT) || 3000;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`碎语 Mini Feed 已启动: http://localhost:${info.port}`);
  console.log(`接口地址: http://localhost:${info.port}/api`);
});
