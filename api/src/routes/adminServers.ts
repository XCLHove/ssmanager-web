import { Router } from 'express';
import { ManagerError } from '../managerClient.js';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import {
  ServerUsersError,
  applyFromDb,
} from '../services/serverUsersService.js';

const router = Router();

function sendServiceError(res, err) {
  if (err instanceof ServerUsersError) {
    return fail(res, err.code, err.message);
  }
  if (err instanceof ManagerError) {
    return fail(res, 502, err.message);
  }
  console.error('[admin/servers] 未预期的错误:', err);
  return fail(res, 500, '服务器内部错误');
}

// POST /api/admin/servers/reapply {port}
router.post('/reapply', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  const port = Number(req.body?.port);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }

  try {
    await applyFromDb(port);
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

export default router;
