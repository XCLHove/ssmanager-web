import type { Session } from '../auth/sessionStore.js';

/**
 * requireAuth 成功后会把会话挂到 req.session。
 * 这里声明为非可选，避免所有鉴权路由重复非空断言（仅类型层约定）。
 */
declare global {
  namespace Express {
    interface Request {
      session: Session;
    }
  }
}

export {};
