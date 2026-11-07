import { Router } from 'express';
import { config } from '../config.js';
import {
  getLoginKey,
  removeLoginKey,
  isRegisterBlocked,
  recordRegisterFailure,
  clearRegisterFailures,
} from '../authService.js';
import { hashPassword } from '../auth/password.js';
import { createUserWithCode } from '../stores/registrationCodeStore.js';
import { decryptEnvelope } from '../requestCrypto.js';
import { ok, fail } from '../response.js';

const router = Router();

const LOGIN_KEY_ERROR = '登录密钥无效或已过期，请刷新后重试';

/**
 * 公开注册：body { kid, data: { key, iv, data } }
 * 解密后得到 { username, password(md5 hex), code }。
 * 不自动登录；成功仅返回 { ok: true }。
 */
router.post('/', async (req, res) => {
  if (isRegisterBlocked(req.ip)) {
    return fail(res, 429, '注册失败次数过多，请稍后再试');
  }

  const { kid, data } = req.body ?? {};

  if (typeof kid !== 'string' || kid.length === 0) {
    return fail(res, 400, LOGIN_KEY_ERROR);
  }

  const loginKey = getLoginKey(kid);
  if (!loginKey) {
    return fail(res, 400, LOGIN_KEY_ERROR);
  }

  let payload;
  try {
    payload = decryptEnvelope(loginKey.privateKey, data);
  } catch (err) {
    return fail(res, 400, '请求数据解密失败');
  }

  const { username, password } = payload ?? {};
  const code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';

  if (typeof username !== 'string' || !/^[A-Za-z0-9_-]{2,32}$/.test(username)) {
    recordRegisterFailure(req.ip);
    return fail(res, 400, '用户名格式不正确（2-32 位字母、数字、下划线或短横线）');
  }
  if (username.toLowerCase() === config.username.toLowerCase()) {
    recordRegisterFailure(req.ip);
    return fail(res, 400, '用户名不可用');
  }
  if (typeof password !== 'string' || password.length === 0) {
    recordRegisterFailure(req.ip);
    return fail(res, 400, '密码不能为空');
  }
  if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) {
    recordRegisterFailure(req.ip);
    return fail(res, 400, '注册码格式不正确');
  }

  const result = createUserWithCode({
    username,
    passwordHash: hashPassword(password),
    code,
  });
  if (result.error) {
    recordRegisterFailure(req.ip);
    return fail(res, 400, result.error);
  }

  removeLoginKey(kid);
  clearRegisterFailures(req.ip);
  return ok(res, { ok: true });
});

export default router;
