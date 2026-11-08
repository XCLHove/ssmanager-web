import { Router } from 'express';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import { getTrafficHistory } from '../services/trafficSampler.js';

const router = Router();

// POST /api/admin/stats/history {port, seconds}
router.post('/history', requireAuth, requireAdmin, decryptRequest, (req, res) => {
  const port = Number(req.body?.port);
  const seconds = Number(req.body?.seconds);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }
  if (!Number.isInteger(seconds) || seconds < 10 || seconds > 60) {
    return fail(res, 400, '秒数必须是 10-60 之间的整数');
  }

  const { samples, latest } = getTrafficHistory(port, seconds);
  return okEncrypted(res, req.session, {
    port,
    window: seconds,
    unit: 'bytes/s',
    samples,
    latest,
  });
});

export default router;
