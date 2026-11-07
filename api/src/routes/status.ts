import { Router } from 'express';
import { managerClient, ManagerError } from '../managerClient.js';
import { managerAddressString } from '../config.js';
import { requireAuth, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';

const router = Router();

// POST /api/status → data { ok: true, address } / { ok: false, error }
// 通过 `ping` 命令探测 ssmanager 存活（超时 3 秒，见 config.managerTimeoutMs）
router.post('/status', requireAuth, decryptRequest, async (req, res) => {
  try {
    await managerClient.pingStats();
    return okEncrypted(res, req.session, { ok: true, address: managerAddressString() });
  } catch (err) {
    const message =
      err instanceof ManagerError ? err.message : '探测 ssmanager 时发生未知错误';
    return okEncrypted(res, req.session, { ok: false, error: message });
  }
});

// POST /api/stats → data { supported: true, stats: { "8388": 12345 }, unit: "bytes" }
// shadowsocks-rust 的 ssmanager 不支持 `stat` 推送（服务器与 manager 同进程运行），
// 流量数据通过 `ping` 命令查询：端口 → 累计收发字节数（tx + rx）。
router.post('/stats', requireAuth, decryptRequest, async (req, res) => {
  try {
    const stats = await managerClient.pingStats();
    return okEncrypted(res, req.session, { supported: true, stats, unit: 'bytes' });
  } catch (err) {
    if (err instanceof ManagerError) {
      return fail(res, 502, err.message);
    }
    console.error('[stats] 未预期的错误:', err);
    return fail(res, 500, '服务器内部错误');
  }
});

export default router;
