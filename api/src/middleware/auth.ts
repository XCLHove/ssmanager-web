import { getSession, revokeUserSessions } from '../auth/sessionStore.js';
import { db } from '../db.js';
import { decryptSymmetric } from '../requestCrypto.js';
import { fail } from '../response.js';

/** 鉴权中间件：要求 `Authorization: Bearer <token>`，DB 用户还需 enabled=1 */
export function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match ? match[1].trim() : null;

  if (!token) {
    return fail(res, 401, '未提供访问令牌');
  }

  const session = getSession(token);
  if (!session) {
    return fail(res, 401, '访问令牌无效或已过期');
  }

  if (session.userId !== null) {
    const user = db.prepare('SELECT enabled FROM users WHERE id = ?').get(session.userId);
    if (!user || user.enabled !== 1) {
      revokeUserSessions(session.username);
      return fail(res, 401, '访问令牌无效或已过期');
    }
  }

  req.session = session;
  return next();
}

/** 管理员权限中间件（需在 requireAuth 之后使用） */
export function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== 'admin') {
    return fail(res, 403, '需要管理员权限');
  }
  return next();
}

/**
 * 解密中间件：body 形如
 *   { data: { iv: <base64>, data: <base64> } }
 * 使用当前会话的 requestKey 做 AES-256-GCM 解密（iv 12 字节，末尾 16 字节 tag），
 * 成功后 JSON.parse 写入 req.body；空 body 视为 {}。
 */
export function decryptRequest(req, res, next) {
  const body = req.body;

  if (
    body === undefined ||
    body === null ||
    (typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 0)
  ) {
    req.body = {};
    return next();
  }

  try {
    req.body = decryptSymmetric(req.session.requestKey, body.data);
    return next();
  } catch (err) {
    return fail(res, 400, '请求数据解密失败');
  }
}
