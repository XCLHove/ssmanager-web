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

单文件部署：复制 `api/dist`、`ui/dist` 与 `config.json`，用 `node dist/server.mjs` 启动，无需安装依赖。
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

## 配置

完整配置项、环境变量、`-c` 指定配置文件、单文件部署说明见 [api/README.md](api/README.md)。
