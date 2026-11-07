import { Router } from 'express';
import { ManagerError } from '../managerClient.js';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { revokeUserSessions } from '../auth/sessionStore.js';
import { hashPassword } from '../auth/password.js';
import { getAllServerConfigs } from '../serverStore.js';
import { addGrant, getGrantPorts, removeGrant } from '../stores/grantStore.js';
import {
  deletePasswordsForUserPort,
  listPasswordsForUserPort,
  restorePasswordRow,
} from '../stores/passwordStore.js';
import {
  findUserById,
  listUsers,
  setUserEnabled,
  setUserPasswordHash,
} from '../stores/userStore.js';
import { ServerUsersError, applyFromDb } from '../services/serverUsersService.js';
import { okEncrypted, fail } from '../response.js';

const router = Router();

function parsePositiveInt(value, fallback) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 ? num : fallback;
}

function sendServiceError(res, err) {
  if (err instanceof ServerUsersError) {
    return fail(res, err.code, err.message);
  }
  if (err instanceof ManagerError) {
    return fail(res, 502, err.message);
  }
  console.error('[admin/users] 未预期的错误:', err);
  return fail(res, 500, '服务器内部错误');
}

// POST /api/admin/users/list {keyword?, page?, pageSize?}
router.post('/list', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const keyword = typeof req.body?.keyword === 'string' ? req.body.keyword : '';
  const page = parsePositiveInt(req.body?.page, 1);
  const pageSize = Math.min(parsePositiveInt(req.body?.pageSize, 20), 100);

  const result = listUsers({ keyword, page, pageSize });
  return okEncrypted(res, req.session, result);
});

// POST /api/admin/users/set-enabled {userId, enabled}
router.post('/set-enabled', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const userId = Number(req.body?.userId);
  const enabled = req.body?.enabled;

  if (!Number.isInteger(userId)) {
    return fail(res, 400, '用户 ID 无效');
  }
  if (typeof enabled !== 'boolean') {
    return fail(res, 400, 'enabled 必须是布尔值');
  }

  const user = findUserById(userId);
  if (!user) {
    return fail(res, 400, '用户不存在');
  }

  setUserEnabled(userId, enabled);
  if (!enabled) {
    revokeUserSessions(user.username);
  }
  return okEncrypted(res, req.session, { ok: true });
});

// POST /api/admin/users/reset-password {userId, password(md5 hex)}
router.post('/reset-password', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const userId = Number(req.body?.userId);
  const password = req.body?.password;

  if (!Number.isInteger(userId)) {
    return fail(res, 400, '用户 ID 无效');
  }
  if (typeof password !== 'string' || password.length === 0) {
    return fail(res, 400, '密码不能为空');
  }

  const user = findUserById(userId);
  if (!user) {
    return fail(res, 400, '用户不存在');
  }

  setUserPasswordHash(userId, hashPassword(password));
  revokeUserSessions(user.username);
  return okEncrypted(res, req.session, { ok: true });
});

// POST /api/admin/users/grants/get {userId}
router.post('/grants/get', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const userId = Number(req.body?.userId);
  if (!Number.isInteger(userId)) {
    return fail(res, 400, '用户 ID 无效');
  }
  if (!findUserById(userId)) {
    return fail(res, 400, '用户不存在');
  }
  return okEncrypted(res, req.session, { ports: getGrantPorts(userId) });
});

// POST /api/admin/users/grants/set {userId, ports}
// 撤销授权：删除该用户对应密码行 → 重建端口 → 删除 grant；返回 affectedPorts。
router.post('/grants/set', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  const userId = Number(req.body?.userId);
  const rawPorts = req.body?.ports;

  if (!Number.isInteger(userId)) {
    return fail(res, 400, '用户 ID 无效');
  }
  if (!findUserById(userId)) {
    return fail(res, 400, '用户不存在');
  }
  if (!Array.isArray(rawPorts)) {
    return fail(res, 400, '端口列表格式不正确');
  }

  const ports = [...new Set(rawPorts.map(Number))];
  if (ports.some((port) => !Number.isInteger(port) || port < 1 || port > 65535)) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }

  const configs = getAllServerConfigs();
  for (const port of ports) {
    const record = configs[String(port)];
    if (!record || typeof record.method !== 'string' || !record.method.startsWith('2022-blake3-')) {
      return fail(
        res,
        400,
        `端口 ${port} 不支持授权（仅 2022-blake3-* 且有本地配置的服务器可授权）`
      );
    }
  }

  const current = getGrantPorts(userId);
  const toAdd = ports.filter((port) => !current.includes(port));
  const toRemove = current.filter((port) => !ports.includes(port));
  const affectedPorts: number[] = [];

  for (const port of toRemove) {
    const snapshots = listPasswordsForUserPort(userId, port);
    deletePasswordsForUserPort(userId, port);

    if (snapshots.length > 0) {
      try {
        await applyFromDb(port);
      } catch (err) {
        for (const row of snapshots) {
          try {
            restorePasswordRow(row);
          } catch {
            // 恢复失败时仍返回原始错误
          }
        }
        return sendServiceError(res, err);
      }
    }

    removeGrant(userId, port);
    affectedPorts.push(port);
  }

  for (const port of toAdd) {
    addGrant(userId, port);
    affectedPorts.push(port);
  }

  affectedPorts.sort((a, b) => a - b);
  return okEncrypted(res, req.session, { ok: true, affectedPorts });
});

export default router;
