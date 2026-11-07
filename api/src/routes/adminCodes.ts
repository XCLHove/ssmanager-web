import { Router } from 'express';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import {
  generateRegistrationCodes,
  listRegistrationCodes,
  removeRegistrationCode,
} from '../stores/registrationCodeStore.js';

const router = Router();

// POST /api/admin/codes/generate {count}
router.post('/generate', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const count = Number(req.body?.count);
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    return fail(res, 400, '数量必须是 1-50 之间的整数');
  }
  const codes = generateRegistrationCodes(count, req.session.username);
  return okEncrypted(res, req.session, { codes });
});

// POST /api/admin/codes/list {status?}  status: unused | used
router.post('/list', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const status = req.body?.status;
  if (status !== undefined && status !== null && status !== '' && status !== 'unused' && status !== 'used') {
    return fail(res, 400, '状态参数无效');
  }
  const result = listRegistrationCodes(status || undefined);
  return okEncrypted(res, req.session, result);
});

// POST /api/admin/codes/remove {id}
router.post('/remove', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const id = Number(req.body?.id);
  if (!Number.isInteger(id)) {
    return fail(res, 400, '注册码 ID 无效');
  }
  const result = removeRegistrationCode(id);
  if (result.error) {
    return fail(res, 400, result.error);
  }
  return okEncrypted(res, req.session, { ok: true });
});

export default router;
