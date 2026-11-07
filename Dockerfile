# syntax=docker/dockerfile:1

# ---- 前端构建 ----
FROM node:22-bookworm AS ui-build
WORKDIR /app/ui
RUN npm install -g pnpm@11
COPY ui/package.json ui/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.strictDepBuilds=false
COPY ui/ ./
RUN pnpm build

# ---- 后端构建（单文件 bundle + unix-dgram 原生模块）----
FROM node:22-bookworm AS api-build
WORKDIR /app/api
RUN npm install -g pnpm@11 \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
COPY api/package.json api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --config.strictDepBuilds=false
# 允许并执行被 pnpm 拦截的构建脚本（含 unix-dgram 原生模块）
RUN pnpm approve-builds --all && pnpm rebuild
COPY api/ ./
RUN pnpm build

# ---- 运行时 ----
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    SSMANAGER_UI_DIR=/app/ui/dist
WORKDIR /app

COPY --from=api-build /app/api/dist ./dist
COPY --from=ui-build /app/ui/dist ./ui/dist
COPY api/config.example.json ./config.example.json
COPY api/.env.example ./.env.example
COPY api/README.md ./README.md

RUN mkdir -p /app/data && chown -R node:node /app
USER node

VOLUME ["/app/data"]
EXPOSE 3000

# 未挂载 config.json 时使用环境变量或内置默认值；挂载示例：
#   docker run ... -v $PWD/config.json:/app/config.json:ro
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/server.mjs"]
