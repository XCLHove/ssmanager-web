# ssmanager-web

shadowsocks-rust `ssmanager` 的 Web 管理面板：多用户、注册码、服务器授权、每用户密码、ClashMeta 订阅与 JS 配置模板。

- 后端：`api/`（TypeScript + Express 5 + node:sqlite，esbuild 单文件打包）
- 前端：`ui/`（Vite 8 + Vue 3 + Element Plus）
- 运行要求：Node.js 22（后端）、pnpm 11（开发/构建）

所有配置只从配置文件读取，**不再读取环境变量或 `.env`**；启动时必须用
`-c <path>`（或 `--config <path>` / `--config=<path>`）指定配置文件。

## 开发

```bash
# 后端（首次先复制配置示例）
cd api
cp config.example.json config.json
pnpm install
pnpm dev -- -c config.json

# 前端（另开终端，dev 代理 /api → localhost:3000）
cd ui && pnpm install && pnpm dev
```

## 构建与单文件部署

```bash
cd ui && pnpm install && pnpm build      # 产出 ui/dist
cd api && pnpm install && pnpm build     # 产出 api/dist（server.mjs + node_modules/unix-dgram）
```

后端固定从 `<PACKAGE_ROOT>/../ui/dist` 托管前端（`PACKAGE_ROOT` 为 `server.mjs`
所在 `dist/` 的上一级），因此推荐布局：

```text
deploy/
├── ui/
│   └── dist/
└── ssmanager-web/
    ├── config.json          # cp api/config.example.json config.json
    └── dist/
        ├── server.mjs
        └── node_modules/    # unix-dgram 及其依赖
```

```bash
cd deploy/ssmanager-web
node --disable-warning=ExperimentalWarning dist/server.mjs -c config.json
```

无需 `pnpm install`。只使用 API、不需要前端时，可只保留 `ssmanager-web/`。
详细配置与 Unix socket 说明见 [api/README.md](api/README.md)。

## 持久化与恢复

ssmanager 对动态 `add` 的服务器**不做持久化**，ssmanager 重启后这些端口会消失。
ssmanager-web 以本地 SQLite 为唯一事实来源，进行**双向对账**：

- 启动时立即对账一次，之后每 30 秒对账一次；
- 本地有记录、ssmanager 缺失的端口会自动 `add` 回来（包含该端口的用户密码）；
- ssmanager 中存在、但本地 `server_configs` 没有记录的端口会被自动 `remove`；
- ssmanager 未启动或暂时不可达时 Web 正常启动，不修改任何数据，后续周期自动重试。

因此**不要绕过面板操作 ssmanager**：手工 `remove` 会被对账补回，手工 `add` 会被对账移除；
增删服务器请通过面板 API/页面操作。

**注意**：若数据目录配置错误/未挂载导致本地记录为空，下一次对账会把 ssmanager 中
所有端口全部移除。请务必确认 `dataDir` 与数据卷挂载正确。
若本地记录已被旧版本自动 prune 删除，则无法自动恢复，需要重新创建。

## 发布

推送 `v*` 标签触发 [.github/workflows/release.yml](.github/workflows/release.yml)：

```bash
git tag v1.0.0
git push origin v1.0.0
```

流水线会：

1. 构建前端与后端单文件产物；
2. 打包 `ssmanager-web-v1.0.0.tar.gz`（包含平级的 `ssmanager-web/` 与 `ui/`、
   `config.example.json` 与 README）并发布到 GitHub Release；
3. 构建 Docker 镜像并推送到 GitHub Container Registry：
   - `ghcr.io/xclhove/ssmanager-web:1.0.0`
   - `ghcr.io/xclhove/ssmanager-web:1.0`
   - `ghcr.io/xclhove/ssmanager-web:latest`

镜像为 `linux/amd64`，内置 Linux 版 `unix-dgram`。

## Docker 运行

```bash
# 1. 准备配置文件（至少修改密码；宿主机 ssmanager 用 host.docker.internal:6100）
cp api/config.example.json config.json
vi config.json

# 2. 启动（配置文件以只读方式挂载）
docker run -d --name ssmanager-web \
  -p 3000:3000 \
  -v "$PWD/config.json:/app/config.json:ro" \
  -v "$PWD/data:/app/data" \
  --add-host=host.docker.internal:host-gateway \
  ghcr.io/xclhove/ssmanager-web:latest
```

- 容器内固定执行 `dist/server.mjs -c /app/config.json`；未挂载配置文件会直接报错退出。
- **ssmanager 在宿主机**：在 `config.json` 中设置
  `"ssmanagerAddress": "host.docker.internal:6100"`；Linux 需上面的 `--add-host`，
  或使用 `--network host` 并在配置中写 `127.0.0.1:6100`。
- **Unix socket**：挂载 `-v /run/ssmanager.sock:/run/ssmanager.sock`，并在 `config.json`
  设置 `"ssmanagerAddress": "unix:/run/ssmanager.sock"`。
- **数据**：SQLite 默认位于 `/app/data`（由配置 `dataDir` 决定），务必挂载持久化。
- **端口**：容器监听配置中的 `webPort`（默认 3000），请与 `-p` 映射保持一致。

## Docker Compose

```bash
# 1. 准备配置文件（必须修改密码等）
cp api/config.example.json config.json
vi config.json

# 2. 启动（ssmanager 需已在宿主机运行）
docker compose up -d

# 3. 查看状态与日志
docker compose ps
docker compose logs -f
```

`compose.yaml` 已将 `./config.json` 只读挂载到 `/app/config.json`，端口固定映射
`3000:3000`（请保持配置中 `webPort: 3000`），数据使用命名卷 `ssmanager-data`。
不再使用 `.env` 或任何环境变量。

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

其他场景：

- **Unix socket**：取消 `compose.yaml` 中 `/run/ssmanager.sock` 挂载的注释，并在
  `config.json` 设置 `"ssmanagerAddress": "unix:/run/ssmanager.sock"`。
- **Linux 共享网络**：取消 `network_mode: host` 注释并移除 `ports`，即可直接访问
  `127.0.0.1:6100` 上的 ssmanager。
- **数据持久化**：默认使用命名卷 `ssmanager-data`；可用
  `docker volume inspect ssmanager-web_ssmanager-data` 查看实际路径，备份其中
  `ssmanager-web.db`。

## 配置

配置只来自 `-c` 指定的文件。完整键、默认值、Unix socket、单文件部署与平台要求见
[api/README.md](api/README.md)，模板见 [api/config.example.json](api/config.example.json)。
