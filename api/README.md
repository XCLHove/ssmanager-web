# ssmanager-web API

ssmanager-web 的 Express 后端。通过 UDP 文本协议与本机的 shadowsocks-rust `ssmanager` 通信，
对端口进行增删查，并向浏览器前端提供带登录会话与请求体加密的 HTTP API。

## 协议说明（shadowsocks-rust ssmanager）

`ssmanager` 在 UDP 上接收如下文本命令（均以 `\n` 结尾），实现对 ssserver 端口的进程内管理：

| 命令 | 发送内容 | 响应 |
| --- | --- | --- |
| `add` | `add: {"server_port":8388,"password":"xxx"}` | `ok`（失败为错误文本） |
| `remove` | `remove: {"server_port":8388}` | `ok` |
| `list` | `list` | JSON 数组 `[{"server_port":8388,"password":"..."}]` |
| `ping` | `ping` | `stat: {"8388":12345}`（端口 → 累计收发字节数） |

要点：

- `add` 的 JSON 载荷除 `server_port`、`password` 外，协议层面还支持可选的
  `method`、`no_delay`、`plugin`、`plugin_opts`、`plugin_mode`、`mode`、`users` 字段
  （`users` 为 `[{name, password}]`，用于多用户模式）。本 API 将 camelCase 请求字段
  映射为上述 snake_case 字段；未提供的可选字段不会出现在发给 ssmanager 的 JSON 中。
- **流量统计**：shadowsocks-rust 的 ssmanager 不支持 libev 风格的 `stat` 推送
  （服务器与 manager 同进程运行，README 明确注明 "stat command is not supported"）。
  流量数据唯一可查询方式是 `ping` 命令，响应 `stat: {端口: 累计字节数}`（tx+rx 合计，
  自服务进程启动起累计，删除端口后清零）。因此 `/api/stats` 基于该命令实现。
- 受 ssmanager 1.25.0 限制，`list` 只回填 `server_port`、`password`、`users`；
  `method`、`no_delay`、`plugin`、`plugin_opts`、`plugin_mode`、`mode` 恒被省略
  （见 shadowsocks-rust v1.25.0 `manager/server.rs` 的 `handle_list`）。
  为弥补这一点，本 API 会把通过 add/update 提交的高级字段持久化到 SQLite
  `<dataDir>/ssmanager-web.db` 的 `server_configs` 表（默认 `api/data/ssmanager-web.db`；
  不存密码/users；数据目录已在 .gitignore 中），list 时合并返回并附带
  `configKnown`（有本地记录为 true，外部创建的端口为 false）。
  update 未提交的高级字段会沿用本地记录（例如只改密码时保留 method）。
  数据库初始化失败会让启动失败（避免静默丢数据）；运行期读写失败只记录日志。
  旧版 `api/data/servers.json` 不再读取，也不做数据迁移（文件保留即可）。
- 协议来源：
  - README「Server Manager」章节：<https://github.com/shadowsocks/shadowsocks-rust#server-manager>
  - 协议定义：<https://github.com/shadowsocks/shadowsocks-rust/blob/master/crates/shadowsocks/src/manager/protocol.rs>
  - 命令处理（响应格式）：<https://github.com/shadowsocks/shadowsocks-rust/blob/master/crates/shadowsocks-service/src/manager/server.rs>

## 统一响应信封

所有 `/api` 响应（包括鉴权失败、参数错误、manager 错误）**HTTP 状态码一律为 200**，
业务状态放在 JSON 的 `code` 字段：

成功：

```json
{ "code": 0, "message": "ok", "data": { } }
```

需鉴权接口的成功响应 `data` 不是明文，而是 AES-256-GCM 加密信封 `{ iv, data }`
（详见「加密请求与响应」）。`/api/auth/public-key` 与 `/api/auth/login` 的成功响应为明文 `data`。

失败：

```json
{ "code": 400, "message": "请求数据解密失败", "data": null }
```

`code` 取值：`0` 成功；`400` 请求/解密/参数错误；`401` 未登录或 token 失效；
`404` 接口不存在；`429` 登录失败次数过多；`500` 服务器内部错误；`502` ssmanager 通信或执行失败。
畸形 JSON 同样返回 HTTP 200 + `code: 400`。

## 登录与会话

登录分两步：

1. `POST /api/auth/public-key`（不鉴权、不加密，body 可为空）获取短时登录公钥：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "publicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n",
    "kid": "<8 字节随机数的 hex>",
    "expiresAt": 1760000000000
  }
}
```

   公钥池规则：每对 RSA-2048 密钥有效期 60 秒；若池中存在剩余有效期 > 10 秒的密钥则复用，
   否则新建；池上限 8，超限淘汰最旧项。登录成功后该 `kid` 的密钥对立即删除（一次性）。

2. `POST /api/auth/login`（不鉴权，但请求体加密）：

```json
{
  "kid": "<public-key 返回的 kid>",
  "data": { "key": "<base64>", "iv": "<base64>", "data": "<base64>" }
}
```

   解密后为 `{ username, password, sessionKey }`：
   - `password` 是**明文密码的 MD5 小写 hex**，服务端对配置中的明文密码计算 MD5 后做恒定时间比较；
   - `sessionKey` 必须是 Base64，解码后**恰好 32 字节**；缺失/非法返回 `code: 400`、
     `message: "登录密钥协商失败"`。

   服务端用 HKDF-SHA256 从 `sessionKey` 派生两把 32 字节子密钥（Node `crypto.hkdfSync`）：

   | 用途 | salt | info |
   | --- | --- | --- |
   | requestKey | `ssmanager-session-key` | `ssmanager/request` |
   | responseKey | `ssmanager-session-key` | `ssmanager/response` |

   `kid` 缺失、未知或已过期返回 `code: 400`、`message: "登录密钥无效或已过期，请刷新后重试"`；
   登录请求解密失败返回 `code: 400`、`message: "请求数据解密失败"`。

登录成功返回（明文）：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "token": "<32 字节随机数的 hex>",
    "username": "admin",
    "role": "admin",
    "userId": null
  }
}
```

- 配置中的管理员优先校验（`role: "admin"`、`userId: null`）；否则查 `users` 表，
  普通用户密码使用 scrypt 校验（`scrypt$N$r$p$salt$hash`）。
- 登录错误语义：
  - 用户名或密码为空 → `code: 400`、`message: "请输入用户名和密码"`；
  - 账号不存在（配置管理员与 `users` 表均无）→ `code: 401`、`message: "用户不存在"`；
  - 账号存在但密码错误 → `code: 401`、`message: "密码错误"`；
  - DB 用户密码正确但已禁用 → `code: 403`、`message: "账号已被禁用"`；
  - 失败仍按「用户名 + 来源 IP」计入限流，超限 `429`。密码比较保持恒定时间。
- 会话只保存在内存：`token`、`requestKey`、`responseKey`、username、role、userId、过期时间
  （配置文件 `jwtExpiresIn`）；不保存会话 RSA 密钥对。
- **按账号单点登录**：同一账号新登录会立即使旧 token 失效；进程重启后所有会话失效。
- 登录失败限流：同一「用户名 + 来源 IP」10 分钟内失败 5 次后封禁 5 分钟，返回 `code: 429`。
- `POST /api/auth/logout`（需鉴权+加密）销毁当前 token。

## 注册

`POST /api/auth/register`（不鉴权，但请求体与登录相同，使用 RSA 信封）：

```json
{
  "kid": "<public-key 返回的 kid>",
  "data": { "key": "<base64>", "iv": "<base64>", "data": "<base64>" }
}
```

解密后为 `{ username, password, code }`：

- `username`：2-32 位 `[A-Za-z0-9_-]`，大小写不敏感唯一，且不得与配置管理员同名；
- `password`：明文密码的 MD5 小写 hex（服务端用 scrypt 存储）；
- `code`：注册码，格式 `XXXX-XXXX-XXXX`（去易混字符）。

服务端在事务内原子占码并创建用户，成功返回 `{ok:true}`（**不自动登录**），
并销毁一次性登录密钥对。注册失败按来源 IP 限流（10 分钟内 10 次失败封禁 5 分钟）。
响应信封与登录一致。

## 多用户密码与订阅

- 仅 `2022-blake3-*` 且存在本地配置的服务器可授权、可生成用户密码。
- 用户每个授权服务器仅允许 **1 个密码**（新密码固定 `slot=1`；历史 `slot=2` 数据保留、照实返回）；
  每个密码对应 ssmanager 托管用户 `ssm_u<userId>_p<slot>`，并生成独立订阅 URL。
- 密码增删都会重建该端口：`removeServer` → 短延迟 → `addServer(主PSK + DB 中全部托管 users)`
  → `list` 复核。失败时尝试用旧 users 恢复；仍失败返回 `502`，DB 不变，可用
  `POST /api/admin/servers/reapply {port}` 重试。
- `/api/servers/list` 的 `servers[].users` 会解析 `ssm_u<userId>_p<slot>` 批量补充 `username`
  （查不到或手工用户不输出该字段）；`name`/`password` 字段保持不变。
- 托管 users **只来自数据库**；`/api/servers/add|update` 会忽略请求中的手工 `users`。
  已有用户密码时禁止改端口、禁止改成非 2022-blake3-* 方法。
- 订阅 URL：`<publicBaseUrl 或请求 origin>/sub/<token>`，公开 GET。新密码默认返回
  **age 加密的 ClashMeta YAML**；`?plain=1` 返回明文兼容内容。
- `/api/user/*` 仅供普通用户（配置管理员 userId=null 返回 `403`）。
- `templateReady` 表示管理员是否为该服务器保存过自定义模板；未保存时订阅使用内置默认模板。

### age 加密订阅

- 生成用户密码时同时生成 age X25519 密钥对，随密码行保存到
  `user_server_passwords.age_private_key` / `age_public_key`。
- 默认 `GET /sub/<token>`：若有 `age_public_key`，用该公钥加密渲染后的 YAML，
  输出 ASCII armor：
  - `Content-Type: text/plain; charset=utf-8`
  - 文件名 `ssmanager-<port>.yaml.age`
  - 保留 `Cache-Control: no-store`、`profile-update-interval: 24`、
    `X-Content-Type-Options: nosniff`
- `GET /sub/<token>?plain=1`（或 `?plain=true`）：始终返回明文 YAML
  （`text/yaml`），用于不支持 age 的客户端。
- 旧密码没有 age 密钥时默认继续返回明文；不会自动补密钥。
- 加密失败返回 `500` `text/plain`「订阅加密失败」，记录日志且绝不回退明文。
- 前端/客户端使用加密订阅时，需要把生成的 `agePrivateKey` 填入支持 age 的客户端；
  不支持 age 时使用返回的 `plainUrl`。
- `/api/user/servers/list` 的每个密码项会返回 `agePrivateKey`、`agePublicKey`、
  `plainUrl`；旧密码对应字段为 `null`。

### 自助修改登录密码

`POST /api/user/password/change {oldPassword, newPassword}`（均为明文密码的 MD5 小写 hex）：

- 配置管理员（`userId=null`）→ `400`「配置文件管理员的密码请在配置文件中修改」；
- 新密码为空 → `400`「新密码不能为空」；
- 旧密码校验失败 → `400`「当前密码错误」（scrypt 恒定时间比较）；
- 新旧密码相同 → `400`「新密码不能与当前密码相同」；
- 成功：重新 scrypt 哈希并更新 `updated_at`，使该用户所有会话立即失效，返回 `{ok:true}`；
  需要用新密码重新登录。

### 删除用户（管理员）

`POST /api/admin/users/remove {userId}`：

1. 收集该用户授权与密码涉及的端口；
2. 显式删除其 `user_server_passwords` 与 `user_server_grants`；
3. 对每个端口 `applyFromDb` 重建 ssmanager users（清除该用户的 `ssm_u*` 条目）；
4. 全部成功后删除 `users` 行、踢下线并返回 `{ok:true, affectedPorts}`。

后果：该用户的授权、密码、全部订阅 URL 立即失效（404），旧 token 立即 401；
`registration_codes.used_by_user_id` 通过 `ON DELETE SET NULL` 保留已使用注册码
（`usedByUsername` 为空，前端可显示“已删除用户”）。

若任一端口重建失败：接口返回 `502`「删除失败，端口 X 重建失败，请重试」，
**不删除 users 行**；此时授权/密码已删除，用户无法再生成/使用，可用
`/api/admin/servers/reapply` 或后续恢复流程继续清理管理器中的残留用户。

## 配置模板

`/api/admin/templates/*` 管理服务器一对一 JS 模板，目前仅支持 `clash` 格式。

**模板库**：`/api/admin/templates/library/*` 提供可复用的模板 CRUD（表 `template_library`）。
在服务器模板编辑器中选择「从模板库载入」会把库中代码**复制替换**到当前服务器模板，
保存后成为该服务器自己的代码；之后修改或删除模板库条目不会影响已引用的服务器。

- 模板签名：`(function (ctx, h) { ... return object | string })`；返回对象时用 `h.yaml()` 序列化。
- `ctx`：`server{port,host,method,mode,noDelay,plugin,pluginOpts,pluginMode,password}`、
  `user{id,username}`、`password{id,slot,psk,name}`、`token`、`generatedAt`、`format`。
- `h`：`yaml(obj)`、`json(...args)`（等价于 `JSON.stringify(...args)`，可传 `value`、`replacer`、`space`）、`base64(str)`、`base64url(str)`、`ssLink({name,host,port,method,password})`（SIP002）。
- 沙箱：`node:vm`，无 `require/process/console/Buffer`，禁用代码生成，执行超时 1000ms，
  代码上限 64KB；编译缓存按 port + code hash。
- 保存/预览会先用假 ctx 试运行，语法错误、超时等返回 `400`。

## 加密请求与响应

除 `/api/auth/public-key`、`/api/auth/login`、`/api/auth/register` 外，所有接口都必须：

1. 使用 `POST`；
2. 携带 `Authorization: Bearer <token>`；
3. 请求 body 为以下信封（用协商出的 **requestKey** 加密）：

```json
{
  "data": {
    "iv": "<base64>",
    "data": "<base64>"
  }
}
```

- `iv`：12 字节随机数；
- `data`：AES-256-GCM 密文，末尾 16 字节为 GCM tag。

服务端中间件顺序：校验 token（必须是当前活动会话且未过期）→ 用 `requestKey` 做 AES-GCM 解密 →
`JSON.parse` 为 `req.body`（空 body 视为 `{}`）。解密失败或信封格式错误返回
`code: 400`、`message: "请求数据解密失败"`。

成功响应同样加密（用 **responseKey**）：

```json
{
  "code": 0,
  "message": "ok",
  "data": { "iv": "<base64>", "data": "<base64>" }
}
```

前端用 `responseKey` 解密 `data` 并 `JSON.parse` 得到业务数据。
错误响应（400/401/404/429/500/502）始终为明文 `{code, message, data:null}`
（401 时没有有效会话，无法加密）。

## 配置文件

所有配置只从配置文件读取，**不读取环境变量或 `.env`**。启动时必须通过
`-c` / `--config` / `--config=` 指定配置文件：

```bash
node dist/server.mjs -c /path/to/config.json
node dist/server.mjs --config /path/to/config.json
node dist/server.mjs --config=/path/to/config.json
```

- 未指定 `-c`、参数缺值、文件不存在/不可读、JSON 解析失败或内容非 JSON 对象时，
  打印含路径与原因的错误，并以退出码 1 退出。
- 相对路径基于**当前工作目录**解析。
- 配置在进程启动时读取，修改后需重启服务。
- 仓库提供 `config.example.json` 作为唯一模板，复制为 `config.json` 后修改
  （`config.json` 已加入 `.gitignore`，避免把凭据提交入库）。

### 配置键与默认值

| 键 | 默认值 | 说明 |
| --- | --- | --- |
| `username` | `admin` | 超级管理员用户名（注册用户不得与其同名） |
| `password` | `admin123` | 超级管理员密码（明文存储；前端提交其 MD5） |
| `ssmanagerAddress` | `127.0.0.1:6100` | ssmanager 地址，支持 UDP `host:port` 与 Unix datagram socket |
| `webHost` | `0.0.0.0` | Web 服务监听地址 |
| `webPort` | `3000` | Web 服务监听端口（1-65535） |
| `jwtExpiresIn` | `12h` | 登录会话有效期，支持 `ms/s/m/h/d` |
| `dataDir` | `data` | SQLite 数据目录；相对路径基于 `PACKAGE_ROOT`，支持绝对路径；DB 文件固定为 `<dataDir>/ssmanager-web.db` |
| `publicHost` | `127.0.0.1` | 客户端连接使用的公网主机/域名（端口沿用服务器端口） |
| `publicBaseUrl` | 空 | 订阅绝对 URL 的基础地址（如 `https://ss.example.com`）；为空时使用请求的 Host |
| `managerTimeoutMs` | `3000` | 与 ssmanager 通信超时（毫秒） |
| `githubRepo` | `XCLHove/ssmanager-web` | 用于检查最新 Release 的 GitHub 仓库（`owner/repo`） |
| `githubToken` | 空 | 可选 GitHub Token；私有仓库或需要提高 API 限额时配置 |

完整示例（`config.example.json`）：

```json
{
  "username": "admin",
  "password": "admin123",
  "ssmanagerAddress": "127.0.0.1:6100",
  "webHost": "0.0.0.0",
  "webPort": 3000,
  "jwtExpiresIn": "12h",
  "dataDir": "data",
  "publicHost": "127.0.0.1",
  "publicBaseUrl": "",
  "managerTimeoutMs": 3000,
  "githubRepo": "XCLHove/ssmanager-web",
  "githubToken": ""
}
```

### `ssmanagerAddress` 解析规则

- **UDP**：`127.0.0.1:6100`、`localhost:6100`、`[::1]:6100`。
  - 省略端口时默认 `6100`；端口非 1-65535 整数时回退 `6100` 并告警。
  - 未写端口的 host 仅接受 IP、`localhost` 或含点域名，否则回退默认地址并告警。
- **Unix datagram socket**：`unix:/run/ssmanager.sock`、`unix:///run/ssmanager.sock`，
  或以 `/`、`./`、`../` 开头的裸路径；空路径回退默认 UDP 地址并告警。
- 旧 `config.json` 的 `ssmanagerPort` 键已移除，存在时忽略（不报错）。

### 常用配置修改

直接编辑 `config.json`：

- 局域网/公网部署：`"publicHost": "ss.example.com"`、`"publicBaseUrl": "https://ss.example.com"`；
- 修改监听端口：`"webPort": 3000`；
- 自定义数据目录：`"dataDir": "D:/ssmanager-data"`（绝对路径）或相对 `PACKAGE_ROOT` 的路径；
- Unix socket 连接的 ssmanager：`"ssmanagerAddress": "unix:/run/ssmanager.sock"`。

### Unix socket 模式说明

- ssmanager 的 Unix 模式是 **Unix datagram socket**，客户端必须 bind 本地路径接收回包。
  Node 内置 `dgram` 不支持 `unix_dgram`，因此使用可选依赖 `unix-dgram`。
- 构建时会把 `unix-dgram` 及其运行期依赖复制到 `dist/node_modules/`（见「开发与构建」），
  部署目录无需再执行 npm install。
- 原生二进制与**构建平台的 OS/架构/Node ABI** 绑定；需在目标平台（或同 ABI 环境）完成
  `pnpm approve-builds` + `pnpm rebuild unix-dgram` 后再构建分发。
- Windows 构建通常无法得到可用的 `.node`，构建只告警不失败；此时 Unix 模式在部署机不可用，
  UDP 模式不受影响。Windows 上配置 Unix 路径不会阻止启动，实际请求返回明确错误。
- 启动日志中，Unix 模式显示 `unix:<path>`，UDP 模式显示 `udp://host:port`。

## 开发与构建

要求 Node.js >= 22，包管理器 pnpm。源码为 TypeScript。

```bash
pnpm install
pnpm dev -- -c config.json        # tsx watch src/index.ts（文件变更自动重启）
pnpm typecheck                    # tsc --noEmit
pnpm build                        # 先 typecheck，再由 esbuild 打包 dist/server.mjs
# 可通过 APP_VERSION 注入版本号（CI 使用 Release tag）：
APP_VERSION=v0.0.5 pnpm build
pnpm start -- -c config.json      # 运行打包产物
```

- npm scripts 不内置 `-c`，必须显式传入（pnpm 传参需要 `--`）。
- esbuild 会把 express/cors/yaml 等全部内联；`unix-dgram` 保持 external。
- 构建后会清理并重新生成 `dist/node_modules/`，递归复制 `unix-dgram` 及其运行期依赖
  （如 `bindings`、`nan`、`file-uri-to-path`），供 `dist/server.mjs` 通过
  `createRequire(import.meta.url)` 直接加载。
- 若复制出的 `unix-dgram` 中没有 `.node`（例如 Windows 上 pnpm 阻止了构建脚本），
  构建仅打印警告、不失败；UDP 模式仍可正常使用。
- 前端静态目录固定为 `<PACKAGE_ROOT>/../ui/dist`；存在时自动托管，
  非 `/api`、非 `/sub` 的 GET 请求 fallback 到 `index.html`。不再支持环境变量覆盖。

## 单文件部署（生产免安装依赖）

主产物为 `dist/server.mjs`（约 1.5MB）；Unix socket 支持还会附带
`dist/node_modules/unix-dgram` 及其运行期依赖。目标机只需要 Node.js >= 22，
**不需要 `pnpm install`**；UDP 部署不依赖任何原生模块。

推荐目录布局（前端目录固定为 `<PACKAGE_ROOT>/../ui/dist`，因此 `ui/` 与
`ssmanager-web/` 平级）：

```text
/opt/deploy/
├── ui/
│   └── dist/
└── ssmanager-web/
    ├── config.json          # 从 config.example.json 复制并修改
    ├── data/                # 首次启动自动创建（SQLite）
    └── dist/
        ├── server.mjs
        └── node_modules/    # 构建时自动复制
            ├── unix-dgram/
            ├── bindings/
            ├── nan/
            └── file-uri-to-path/
```

```bash
# 在 api 目录构建
pnpm build

# 复制 dist 与配置模板
cp -r dist /opt/deploy/ssmanager-web/dist
cp config.example.json /opt/deploy/ssmanager-web/config.json

# 目标机启动（必须 -c；只使用 API 时可省略 ui/ 目录）
cd /opt/deploy/ssmanager-web
node --disable-warning=ExperimentalWarning dist/server.mjs -c config.json
```

路径与可选依赖说明：

- `PACKAGE_ROOT` 固定为 `dist/server.mjs` 的上一级（上面的 `/opt/deploy/ssmanager-web`）；
  `dataDir` 相对路径基于它解析。
- 前端静态目录固定为 `<PACKAGE_ROOT>/../ui/dist`，不支持环境变量覆盖；不提供前端时仅运行 API。
- 启动必须 `-c`；所有配置只来自该文件，不读取环境变量或 `.env`。
- `dist/node_modules/unix-dgram` 的原生二进制与**构建机 OS/架构/Node ABI**绑定：
  - UDP 部署可完全忽略该目录；
  - Unix socket 部署必须在目标平台完成 `pnpm approve-builds` + `pnpm rebuild unix-dgram`
    后重新 `pnpm build` 再分发；Windows 构建通常不包含可用 `.node`（构建仅告警）。
  - 未包含二进制时启动仍正常，仅 Unix 模式请求会返回明确的加载/平台错误。
- 由于包含原生模块，`dist` 体积会随平台增大；不同平台/ABI 的产物不要混用。

## 持久化与恢复

ssmanager 不持久化动态 `add` 的服务器，重启即清空。本后端以 SQLite 为唯一事实来源，
进行双向对账：

- 进程启动时立即执行一次对账，之后每 30 秒执行一次（`setInterval(...).unref()`，
  shutdown 时清理）。
- 读取 `server_configs` 的本地端口集合与 ssmanager 运行端口：
  - `missing = local - running` → 逐个 `applyFromDb` 重建（主 PSK + 数据库用户密码/users）；
  - `extra = running - local` → 逐个 `managerClient.removeServer` 移除。
  - 顺序为先补缺失、再移除未登记端口。
- `extra` 移除与 users 重建共用全局串行队列；移除前会再次检查本地记录，若期间已新增
  则跳过，避免并发误删。
- 本地记录为空而管理器有端口时，会先打印明确警告
  「本地无服务器记录，将移除 ssmanager 中全部 N 个端口」，再执行移除。
- 管理器不可达（未启动/Docker 启动顺序）时直接返回，不增删任何端口；Web 正常启动，
  后续周期自动重试。日志只在恢复/移除成功、失败（同一端口仅首次）以及管理器可达性
  变化时输出，避免每 30 秒刷屏。
- 不修改本地 DB（移除多余端口只操作 ssmanager）；`/servers/list` 不再自动 prune。
  `pruneServerConfigs` 仅保留为手动工具，不再自动调用。

注意：不要绕过面板操作 ssmanager——手工 `remove` 会被补回，手工 `add` 会被移除；
请通过面板 API 增删服务器。**若 `dataDir` 配置错误或数据卷未挂载导致本地记录为空，
下一次对账会移除 ssmanager 中的所有端口**，请务必确认数据目录正确。若本地记录已被
旧版本 prune 删除，则无法自动恢复，需要重新创建。

## 流量历史（管理员）

- ssmanager 的 `ping` 只提供每端口**累计总字节**，无方向（上传/下载）拆分；本接口返回
  **合计速率**，单位 `bytes/s`。
- 后台采样器每 1 秒调用一次 `ping`，每端口在内存中保留最近 300 个样本（约 5 分钟），
  不写 SQLite；端口消失后样本保留 5 分钟再清理。上一次 ping 未完成时跳过本轮。
- `POST /api/admin/stats/history` body `{port, seconds}`：
  - `port` 1-65535；`seconds` 10-60 的整数；
  - 返回窗口内的样本，首点速率使用窗口前最近一个样本作为基准；
  - `rate = max(0, (total_i - total_{i-1}) / dt * 1000)`；
  - 若 `total_i < total_{i-1}`（端口重建/计数器归零），该点 `rate=0`、`reset=true`，
    后续以新值继续；
  - 无样本时 `samples: []`、`latest: null`。
- 现有 `/api/stats` 保持不变（累计总快照，所有登录用户可用）。

## API 列表

除 `POST /api/auth/public-key`、`POST /api/auth/login`、`POST /api/auth/register` 外，
均需 Bearer token 且请求体为上述加密信封。`/api/admin/*` 还要求 `role=admin`（否则 `403`）。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/api/auth/public-key` | 获取登录公钥（不鉴权、不加密）→ data `{publicKey, kid, expiresAt}` |
| `POST` | `/api/auth/login` | 登录。body `{kid, data:{key,iv,data}}`，解密后为 `{username, password(MD5), sessionKey(Base64 32B)}` → data `{token, username, role, userId}`；空字段 `400`；用户不存在/密码错误 `401`；禁用 `403`；失败过多 `429` |
| `POST` | `/api/auth/register` | 注册。body 同上，解密后为 `{username, password(MD5), code}` → data `{ok:true}`；参数/注册码错误 `400`；限流 `429` |
| `POST` | `/api/auth/me` | 当前登录用户 → data `{userId, username, role}` |
| `POST` | `/api/auth/logout` | 退出登录 → data `{ok:true}` |
| `POST` | `/api/admin/codes/generate` | 批量生成注册码 `{count:1-50}` → data `{codes}` |
| `POST` | `/api/admin/codes/list` | 注册码列表 `{status?:unused\|used}` → data `{items, unused, used}` |
| `POST` | `/api/admin/codes/remove` | 删除未使用注册码 `{id}` → data `{ok:true}`；已使用 `400` |
| `POST` | `/api/admin/users/list` | 用户列表 `{keyword?,page?,pageSize?}` → data `{total, items}` |
| `POST` | `/api/admin/users/set-enabled` | 启停用户 `{userId, enabled}`；禁用时踢会话 → data `{ok:true}` |
| `POST` | `/api/admin/users/reset-password` | 重置密码 `{userId, password(MD5)}`；踢会话 → data `{ok:true}` |
| `POST` | `/api/admin/users/remove` | 删除用户 `{userId}` → data `{ok:true, affectedPorts}`；授权/密码/订阅失效，已使用注册码保留 |
| `POST` | `/api/admin/users/grants/get` | 查询授权端口 `{userId}` → data `{ports}` |
| `POST` | `/api/admin/users/grants/set` | 设置授权端口 `{userId, ports}`（仅 2022-blake3-* 且有本地配置）；撤销时删密码行→重建→删授权 → data `{ok:true, affectedPorts}` |
| `POST` | `/api/admin/servers/reapply` | 按数据库 users 重建端口 `{port}` → data `{ok:true}` |
| `POST` | `/api/admin/templates/get` | 读取模板 `{port}` → data `{format, code, defaultCode, updatedAt}` |
| `POST` | `/api/admin/templates/save` | 保存模板 `{port, format:'clash', code}`（编译+试运行校验）→ data `{ok:true}` |
| `POST` | `/api/admin/templates/preview` | 预览模板 `{port, code}` → data `{yaml}` |
| `POST` | `/api/admin/templates/library/list` | 模板库列表 → data `{items:[{id,name,format,createdAt,updatedAt}]}` |
| `POST` | `/api/admin/templates/library/get` | 模板库详情 `{id}` → data `{id,name,format,code,...}` |
| `POST` | `/api/admin/templates/library/create` | 新建模板库 `{name, code, format?}` → data `{id}`；名称唯一、代码需可编译 |
| `POST` | `/api/admin/templates/library/update` | 更新模板库 `{id, name, code, format?}` → data `{ok:true}` |
| `POST` | `/api/admin/templates/library/remove` | 删除模板库 `{id}` → data `{ok:true}`；已复制到服务器的代码不受影响 |
| `POST` | `/api/admin/stats/history` | 管理员流量历史 `{port, seconds:10-60}` → data `{port, window, unit:"bytes/s", samples:[{t,rate,total,reset}], latest}` |
| `POST` | `/api/user/servers/list` | 用户授权服务器与密码槽（`maxSlots=1`）→ data `{items:[{port,host,method,configKnown,templateReady,canGenerate,maxSlots,passwords:[{id,slot,url,plainUrl,agePrivateKey,agePublicKey,createdAt}]}]}` |
| `POST` | `/api/user/passwords/generate` | 生成用户密码 `{port}`（`slot=1`）→ data `{id,slot,password,url,plainUrl,agePrivateKey,agePublicKey}`；已有密码时 `400`“每个服务器最多 1 个密码” |
| `POST` | `/api/user/passwords/remove` | 删除本人密码 `{id}` → data `{ok:true}` |
| `POST` | `/api/user/password/change` | 自助修改登录密码 `{oldPassword, newPassword}(均为 MD5)` → data `{ok:true}`；成功后该用户所有会话失效；配置管理员返回 `400` |
| `GET` | `/sub/:token` | 公开订阅（非信封）：有 age 密钥时返回 age armored `text/plain`，否则 `text/yaml`；`?plain=1` 强制明文；无效/禁用/撤销 `404`，模板/加密错误 `500` |
| `POST` | `/api/servers/list` | 服务器列表 → data `{ports: [8388, ...], servers: [{port, password, ..., configKnown}]}`（按端口升序，未设置的字段省略） |
| `POST` | `/api/servers/add` | 添加端口。body `{port, password, method?, noDelay?, plugin?, pluginOpts?, pluginMode?, mode?, users?}` → data `{ok: true}`；校验失败 `400`；manager 拒绝或启动失败 `502` |
| `POST` | `/api/servers/update` | 编辑配置（remove 旧端口后 add 新配置）。body `{originalPort, ...新配置}`，`port` 为可选新端口 → data `{ok: true}`；校验失败 `400`；manager 错误 `502` |
| `POST` | `/api/servers/remove` | 移除端口。body `{port}` → data `{ok: true}` |
| `POST` | `/api/stats` | 流量统计（经 `ping` 查询）→ data `{supported: true, stats: {"8388": 12345}, unit: "bytes"}`；manager 不可达 `502` |
| `POST` | `/api/status` | 探测 ssmanager（`ping`，约 3 秒超时）→ data `{ok: true, address: "127.0.0.1:6100"}` 或 `{ok: false, error: "..."}` |
| `POST` | `/api/version` | 当前版本与 GitHub 最新 Release（15 分钟缓存）→ data `{current, latest:{tag,name,body,url,publishedAt}\|null, hasUpdate, error}` |

补充说明：

- `POST /api/servers/add` 成功后会用 `list` 复核端口确实在运行，因为 ssmanager 在端口
  绑定失败等情况下仍会回复 `ok`（仅在自身日志中记录错误）。
- `POST /api/servers/remove` 对不存在的端口 ssmanager 也返回 `ok`，本 API 照此转发。
- `POST /api/servers/update` 先 remove 再 add，若 add 失败不会回滚旧端口。
- 未知 `/api` 路由返回 `code: 404`。
- 登录失败响应有 0.4~0.8 秒随机延迟，凭据比较使用 `crypto.timingSafeEqual`（恒定时间）。

## 目录结构

```
api/
├── src/                   # TypeScript 源码（.ts）
│   ├── index.ts           # 入口：启动 HTTP 服务
│   ├── app.ts             # Express 应用装配（中间件/路由/静态托管/错误处理）
│   ├── config.ts          # 配置加载（必须 -c 指定文件；缺失键使用内置默认值）
│   ├── db.ts              # SQLite 统一连接 / 建表与加列迁移 / 外键
│   ├── response.ts        # 统一响应信封 ok/okEncrypted/fail
│   ├── requestCrypto.ts   # 登录 RSA-OAEP 解密 + 请求 AES-GCM 解密
│   ├── managerClient.ts   # ssmanager UDP / Unix datagram 协议客户端
│   ├── authService.ts     # 管理员凭据 / 登录公钥池 / 限流 / 会话门面
│   ├── auth/
│   │   ├── password.ts    # 普通用户 scrypt 密码哈希
│   │   └── sessionStore.ts# 内存会话（单点登录、HKDF 密钥）
│   ├── stores/
│   │   ├── userStore.ts
│   │   ├── registrationCodeStore.ts
│   │   ├── grantStore.ts
│   │   └── passwordStore.ts
│   ├── services/
│   │   ├── serverUsersService.ts  # ssmanager users 重建（串行队列/恢复）
│   │   └── templateService.ts     # vm 模板沙箱与默认 ClashMeta 模板
│   ├── serverStore.ts     # 服务器本地配置（SQLite UPSERT）
│   ├── middleware/
│   │   └── auth.ts        # 会话鉴权 / 管理员校验 / 请求体解密
│   ├── types/             # 共享类型与 Express Request 扩展
│   └── routes/
│       ├── auth.ts        # /api/auth/*
│       ├── register.ts    # /api/auth/register
│       ├── adminCodes.ts  # /api/admin/codes/*
│       ├── adminUsers.ts  # /api/admin/users/*
│       ├── adminServers.ts# /api/admin/servers/reapply
│       ├── adminTemplates.ts # /api/admin/templates/*
│       ├── userServers.ts # /api/user/*
│       ├── subscription.ts# /sub/:token
│       ├── servers.ts     # /api/servers/*（仅管理员）
│       └── status.ts      # /api/status、/api/stats
├── scripts/build.mjs      # esbuild 单文件打包
├── dist/server.mjs        # 构建产物（单文件部署）
├── data/                  # 默认数据目录（运行时生成 SQLite，已 gitignore）
├── tsconfig.json
├── config.example.json    # 唯一配置模板（复制为 config.json 后修改；config.json 已 gitignore）
└── package.json
```
