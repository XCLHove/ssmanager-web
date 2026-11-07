import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';

import { UI_DIST_DIR } from './config.js';
import { fail } from './response.js';
import authRoutes from './routes/auth.js';
import registerRoutes from './routes/register.js';
import adminCodesRoutes from './routes/adminCodes.js';
import adminUsersRoutes from './routes/adminUsers.js';
import adminServersRoutes from './routes/adminServers.js';
import adminTemplatesRoutes from './routes/adminTemplates.js';
import userServersRoutes from './routes/userServers.js';
import subscriptionRoutes from './routes/subscription.js';
import serverRoutes from './routes/servers.js';
import statusRoutes from './routes/status.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  // 开发期前端与 API 跨端口调试需要 CORS
  app.use(cors());
  // 模板代码上限 64KB，经 base64 加密信封后体积会增大约 1/3，这里放宽到 256kb
  app.use(express.json({ limit: '256kb' }));

  // ---- REST API（统一信封；除 login 外均为 POST + Bearer + 加密 body）----
  app.use('/api/auth/register', registerRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin/codes', adminCodesRoutes);
  app.use('/api/admin/users', adminUsersRoutes);
  app.use('/api/admin/servers', adminServersRoutes);
  app.use('/api/admin/templates', adminTemplatesRoutes);
  app.use('/api/user', userServersRoutes);
  app.use('/api/servers', serverRoutes);
  app.use('/api', statusRoutes);

  // 订阅（公开、非信封），需在静态资源/SPA fallback 之前
  app.use('/sub', subscriptionRoutes);

  // 未知 API 路由 → code 404
  app.use('/api', (req, res) => {
    fail(res, 404, '接口不存在');
  });

  // ---- 生产模式：托管前端构建产物 ----
  if (fs.existsSync(UI_DIST_DIR)) {
    app.use(express.static(UI_DIST_DIR));
    // 非 /api 的 GET 请求 fallback 到 index.html（SPA 前端路由）
    app.use((req, res, next) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/sub')
      ) {
        const indexHtml = path.join(UI_DIST_DIR, 'index.html');
        if (fs.existsSync(indexHtml)) {
          return res.sendFile(indexHtml);
        }
      }
      return next();
    });
    console.log(`[app] 已托管前端静态资源: ${UI_DIST_DIR}`);
  }

  // 全局错误处理（含 JSON 解析失败），一律 HTTP 200 + 业务 code
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.parse.failed' || err instanceof SyntaxError) {
      return fail(res, 400, '请求体不是合法 JSON');
    }
    if (err?.type === 'entity.too.large') {
      return fail(res, 400, '请求体过大');
    }
    console.error('[app] 未处理的错误:', err);
    return fail(res, 500, '服务器内部错误');
  });

  return app;
}
