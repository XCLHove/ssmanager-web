# ssmanager-web

shadowsocks-rust `ssmanager` 的 Web 管理面板：多用户、注册码、服务器授权、每用户密码、ClashMeta 订阅与 JS 配置模板。

- 后端：`api/`（TypeScript + Express 5 + node:sqlite，esbuild 单文件打包）
- 前端：`ui/`（Vite 8 + Vue 3 + Element Plus）
- 运行要求：Node.js 22（后端）、pnpm 11（开发/构建）

## 开发

```bash
# 后端
cd api && pnpm install && pnpm dev

# 前端（另开终端，dev 代理 /api → localhost:3000）
cd ui && pnpm install && pnpm dev
```

## 构建

```bash
cd ui && pnpm install && pnpm build      # 产出 ui/dist
cd api && pnpm install && pnpm build     # 产出 api/dist（server.mjs + node_modules/unix-dgram）
```

单文件部署：复制 `api/dist`、`ui/dist`，并将 `api/config.example.json` 复制为 `config.json` 后修改，用 `node dist/server.mjs` 启动，无需安装依赖。
详细配置见 [api/README.md](api/README.md)。

## 发布

推送 `v*` 标签触发 [.github/workflows/release.yml](.github/workflows/release.yml)：

```bash
git tag v1.0.0
git push origin v1.0.0
```

流水线会：

1. 构建前端与后端单文件产物；
2. 打包 `ssmanager-web-v1.0.0.tar.gz`（含 `dist/`、`ui/dist/`、配置示例与 README）并发布到 GitHub Release；
3. 构建 Docker 镜像并推送到 GitHub Container Registry：
   - `ghcr.io/xclhove/ssmanager-web:1.0.0`
   - `ghcr.io/xclhove/ssmanager-web:1.0`
   - `ghcr.io/xclhove/ssmanager-web:latest`

镜像为 `linux/amd64`，内置 Linux 版 `unix-dgram`。

## Docker 运行

```bash
docker run -d --name ssmanager-web \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  -e SSMANAGER_WEB_USERNAME=admin \
  -e SSMANAGER_WEB_PASSWORD='change-me' \
  -e SSMANAGER_ADDRESS=host.docker.internal:6100 \
  -e SSMANAGER_PUBLIC_HOST=ss.example.com \
  -e SSMANAGER_PUBLIC_BASE_URL=https://ss.example.com \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/xclhove/ssmanager-web:latest
```

- **ssmanager 在宿主机**：Docker Desktop 可直接使用 `host.docker.internal`；Linux 需加
  `--add-host=host.docker.internal:host-gateway`，或使用 `--network host` 并配置
  `SSMANAGER_ADDRESS=127.0.0.1:6100`。
- **Unix socket**：`-v /run/ssmanager.sock:/run/ssmanager.sock` +
  `-e SSMANAGER_ADDRESS=unix:/run/ssmanager.sock`。
- **配置文件**：`-v "$PWD/config.json:/app/config.json:ro"`；不挂载时使用环境变量与内置默认值。
- **数据**：SQLite 默认位于 `/app/data`，务必挂载持久化。

## Docker Compose

仓库根目录已提供 `compose.yaml` 与 `.env.example`。

```bash
# 1. 准备环境变量（必须修改 SSMANAGER_WEB_PASSWORD）
cp .env.example .env
vi .env

# 2. 启动（ssmanager 需已在宿主机运行）
docker compose up -d

# 3. 查看状态与日志
docker compose ps
docker compose logs -f
```

浏览器访问 `http://localhost:3000`（端口由 `.env` 的 `WEB_PORT` 控制）。

常用操作：

```bash
# 停止 / 启动 / 重启
docker compose down
docker compose start
docker compose restart

# 更新镜像
docker compose pull
docker compose up -d

# 本地构建镜像（取消 compose.yaml 中 build 注释后）
docker compose up -d --build
```

`.env` 关键项：

| 变量 | 说明 |
| --- | --- |
| `SSMANAGER_WEB_USERNAME` / `SSMANAGER_WEB_PASSWORD` | 管理员账号（密码必填） |
| `SSMANAGER_ADDRESS` | 宿主机 ssmanager 地址，默认 `host.docker.internal:6100` |
| `SSMANAGER_PUBLIC_HOST` | 客户端连接使用的公网域名/IP |
| `SSMANAGER_PUBLIC_BASE_URL` | 订阅基础 URL，如 `https://panel.example.com` |
| `WEB_PORT` | 宿主机映射端口，默认 `3000` |

其他场景：

- **使用配置文件**：`cp api/config.example.json config.json` 并修改，然后取消
  `compose.yaml` 中 `./config.json:/app/config.json:ro` 的注释。挂载配置文件后，
  环境变量仍然优先。
- **Unix socket**：取消 `compose.yaml` 中 `/run/ssmanager.sock` 挂载的注释，并在 `.env`
  设置 `SSMANAGER_ADDRESS=unix:/run/ssmanager.sock`。
- **Linux 共享网络**：取消 `network_mode: host` 注释并移除 `ports`，即可直接访问
  `127.0.0.1:6100` 上的 ssmanager。
- **数据持久化**：默认使用命名卷 `ssmanager-data`；可用
  `docker volume inspect ssmanager-web_ssmanager-data` 查看实际路径，备份其中
  `ssmanager-web.db`。

## 配置

完整配置项、环境变量、`-c` 指定配置文件、单文件部署说明见 [api/README.md](api/README.md)。
