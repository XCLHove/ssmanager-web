# ssmanager-web UI

ssmanager（shadowsocks-rust 服务端管理进程）的 Web 管理页面。

技术栈：Vite 8 + Vue 3 + TypeScript + Element Plus + Vue Router + Axios。

## 开发命令

```sh
pnpm install   # 安装依赖
pnpm dev       # 启动开发服务器（默认 http://localhost:5173）
pnpm build     # 类型检查（vue-tsc）+ 生产构建
pnpm preview   # 本地预览生产构建产物
```

## 后端地址配置

- 开发环境：`vite.config.ts` 中配置了 dev proxy，所有 `/api` 请求代理到 `http://localhost:3000`（ssmanager-web 的 Express 后端）。后端端口变化时修改 `server.proxy['/api'].target` 即可。
- 生产环境：构建产物为静态文件，需要由部署方保证 `/api` 反向代理到后端（如 Nginx），或自行调整 `src/api/http.ts` 中的 `baseURL`。

## 目录结构

```
src/
├── api/            # axios 实例封装（baseURL /api、Bearer 头、401 统一拦截）与 REST 接口定义
├── assets/         # 全局样式
├── components/     # 状态卡片 / 流量统计表 / 添加服务器对话框
├── layouts/        # 主布局（侧边栏 + 顶栏 + 内容区）
├── router/         # 路由与登录守卫
├── utils/          # token 存取（localStorage）
└── views/          # 登录页 / 服务器管理页
```

## 功能说明

- 登录：`POST /api/auth/login`，token 存 localStorage；已登录访问登录页自动跳转主页。
- 鉴权：路由守卫拦截无 token 访问；axios 拦截器对 401 统一清 token 并跳回登录页。
- 服务器管理：列表（`GET /api/servers`）、添加（`POST /api/servers`，端口 1-65535 + 密码必填）、删除（`DELETE /api/servers/:port`，二次确认）。
- 连接状态：`GET /api/status`，绿色/红色标识并显示 address，手动刷新 + 30 秒轮询。
- 流量统计：`GET /api/stats`，仅当 `supported: true` 时显示，否则整块隐藏。
