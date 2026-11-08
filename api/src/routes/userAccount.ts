import { Router } from 'express';
import { requireAuth, decryptRequest } from '../middleware/auth.js';
import { revokeUserSessions } from '../auth/sessionStore.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { findUserById, updatePassword } from '../stores/userStore.js';
import { okEncrypted, fail } from '../response.js';

const router = Router();

// POST /api/user/password/change {oldPassword, newPassword}（均为 MD5 小写 hex）
// 不套用 requireUserSession：配置管理员需要收到明确的提示文案。
router.post('/password/change', requireAuth, decryptRequest, (req, res) => {
  if (req.session.userId === null || req.session.userId === undefined) {
    return fail(res, 400, '配置文件管理员的密码请在配置文件中修改');
  }

  const { oldPassword, newPassword } = req.body ?? {};

  if (typeof newPassword !== 'string' || newPassword.length === 0) {
    return fail(res, 400, '新密码不能为空');
  }

  const user = findUserById(req.session.userId);
  if (!user) {
    return fail(res, 401, '用户不存在');
  }

  if (typeof oldPassword !== 'string' || !verifyPassword(oldPassword, user.password_hash)) {
    return fail(res, 400, '当前密码错误');
  }

  if (oldPassword === newPassword) {
    return fail(res, 400, '新密码不能与当前密码相同');
  }

  updatePassword(user.id, hashPassword(newPassword));
  revokeUserSessions(user.username);
  return okEncrypted(res, req.session, { ok: true });
});

export default router;
