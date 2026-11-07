import { Router } from 'express';
import {
  verifyCredentials,
  createSession,
  removeSession,
  getLoginPublicKey,
  getLoginKey,
  removeLoginKey,
  isLoginBlocked,
  recordLoginFailure,
  clearLoginFailures,
  loginFailureDelay,
} from '../authService.js';
import { verifyPassword } from '../auth/password.js';
import { findUserByUsername, touchLastLogin } from '../stores/userStore.js';
import { requireAuth, decryptRequest } from '../middleware/auth.js';
import { decryptEnvelope } from '../requestCrypto.js';
import { ok, okEncrypted, fail } from '../response.js';
import { config } from '../config.js';
import type { Account } from '../types/models.js';

const router = Router();

const LOGIN_KEY_ERROR = '登录密钥无效或已过期，请刷新后重试';

/** 校验协商的 sessionKey：Base64 且解码后恰好 32 字节 */
function decodeSessionKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    return null;
  }
  const buffer = Buffer.from(value, 'base64');
  return buffer.length === 32 ? buffer : null;
}

/** 获取登录公钥（不鉴权、不加密）。前端用它加密登录/注册明文 */
router.post('/public-key', (req, res) => {
  const { kid, publicKey, expiresAt } = getLoginPublicKey();
  return ok(res, { publicKey, kid, expiresAt });
});

/**
 * 登录：body { kid, data: { key, iv, data } }
 * 解密后得到 { username, password, sessionKey }，password 为明文密码的 MD5 小写 hex。
 * 配置管理员优先，否则查 users 表。
 */
router.post('/login', async (req, res) => {
  const { kid, data } = req.body ?? {};

  if (typeof kid !== 'string' || kid.length === 0) {
    return fail(res, 400, LOGIN_KEY_ERROR);
  }

  const loginKey = getLoginKey(kid);
  if (!loginKey) {
    return fail(res, 400, LOGIN_KEY_ERROR);
  }

  let credentials;
  try {
    credentials = decryptEnvelope(loginKey.privateKey, data);
  } catch (err) {
    return fail(res, 400, '请求数据解密失败');
  }

  const { username, password } = credentials ?? {};
  const sessionKey = decodeSessionKey(credentials?.sessionKey);
  if (!sessionKey) {
    return fail(res, 400, '登录密钥协商失败');
  }

  const usernameOk = typeof username === 'string' && username.length > 0;
  const passwordOk = typeof password === 'string' && password.length > 0;

  // 缺字段也按同样的 401 文案返回，避免枚举账户
  if (!usernameOk || !passwordOk) {
    return fail(res, 401, '用户名或密码错误');
  }

  if (isLoginBlocked(username, req.ip)) {
    return fail(res, 429, '失败次数过多，请 5 分钟后再试');
  }

  let account: Account | null = null;

  if (verifyCredentials(username, password)) {
    account = { userId: null, username: config.username, role: 'admin' };
  } else {
    const user = findUserByUsername(username);
    if (user && verifyPassword(password, user.password_hash)) {
      if (user.enabled !== 1) {
        return fail(res, 403, '账号已被禁用');
      }
      touchLastLogin(user.id);
      account = { userId: user.id, username: user.username, role: user.role || 'user' };
    }
  }

  if (!account) {
    await loginFailureDelay();
    recordLoginFailure(username, req.ip);
    return fail(res, 401, '用户名或密码错误');
  }

  // 登录成功：销毁一次性登录密钥对，并用协商的 sessionKey 派生会话密钥
  removeLoginKey(kid);
  clearLoginFailures(username, req.ip);
  const session = createSession(account, sessionKey);
  return ok(res, {
    token: session.token,
    username: session.username,
    role: session.role,
    userId: session.userId,
  });
});

/** 当前登录用户（加密请求/加密响应） */
router.post('/me', requireAuth, decryptRequest, (req, res) => {
  return okEncrypted(res, req.session, {
    userId: req.session.userId,
    username: req.session.username,
    role: req.session.role,
  });
});

/** 退出登录：销毁当前 token */
router.post('/logout', requireAuth, decryptRequest, (req, res) => {
  removeSession(req.session.token);
  return okEncrypted(res, req.session, { ok: true });
});

export default router;
