import crypto from 'node:crypto';
import { Router } from 'express';
import * as age from 'age-encryption';
import { config } from '../config.js';
import { ManagerError } from '../managerClient.js';
import { requireAuth, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import { getServerRecord } from '../serverStore.js';
import { getGrantPorts, hasGrant } from '../stores/grantStore.js';
import {
  deletePassword,
  getPasswordById,
  insertPassword,
  listPasswordsForUserPort,
  restorePasswordRow,
} from '../stores/passwordStore.js';
import {
  ServerUsersError,
  applyFromDb,
  getServerMount,
} from '../services/serverUsersService.js';

const router = Router();

// 业务层限制：每个用户在每个服务器上仅允许 1 个密码。
// 数据库 CHECK(slot IN (1,2)) 保持不变以兼容历史 slot=2 数据。
const MAX_SLOTS = 1;

/** 配置管理员没有 userId，不提供普通用户接口 */
function requireUserSession(req, res, next) {
  if (req.session.userId === null || req.session.userId === undefined) {
    return fail(res, 403, '仅普通用户可用');
  }
  return next();
}

function sendServiceError(res, err) {
  if (err instanceof ServerUsersError) {
    return fail(res, err.code, err.message);
  }
  if (err instanceof ManagerError) {
    return fail(res, 502, err.message);
  }
  console.error('[user] 未预期的错误:', err);
  return fail(res, 500, '服务器内部错误');
}

/**
 * 订阅 URL：配置了 publicBaseUrl 时返回绝对 URL（兜底），
 * 否则返回相对路径，由前端按当前页面地址补全。
 */
export function subscriptionUrl(token: string, plain = false): string {
  const base = String(config.publicBaseUrl || '').trim().replace(/\/+$/, '');
  const path = `/sub/${token}${plain ? '?plain=1' : ''}`;
  return base ? `${base}${path}` : path;
}

// POST /api/user/servers/list → {items:[...]}
router.post('/servers/list', requireAuth, requireUserSession, decryptRequest, (req, res) => {
  const userId = req.session.userId;

  const items = getGrantPorts(userId).map((port) => {
    const record = getServerRecord(port);
    const rows = listPasswordsForUserPort(userId, port);
    const method = record?.method ?? null;

    return {
      port,
      host: config.publicHost,
      method,
      configKnown: !!record,
      templateReady: !!(record && record.templateCode),
      canGenerate:
        !!record &&
        typeof method === 'string' &&
        method.startsWith('2022-blake3-') &&
        rows.length < MAX_SLOTS,
      maxSlots: MAX_SLOTS,
      passwords: rows.map((row) => ({
        id: row.id,
        slot: row.slot,
        url: subscriptionUrl(row.subscription_token),
        plainUrl: subscriptionUrl(row.subscription_token, true),
        agePrivateKey: row.age_private_key ?? null,
        agePublicKey: row.age_public_key ?? null,
        createdAt: row.created_at,
      })),
    };
  });

  return okEncrypted(res, req.session, { items });
});

// POST /api/user/passwords/generate {port}
router.post('/passwords/generate', requireAuth, requireUserSession, decryptRequest, async (req, res) => {
  const userId = req.session.userId;
  const port = Number(req.body?.port);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }
  if (!hasGrant(userId, port)) {
    return fail(res, 400, '没有该服务器的授权');
  }

  try {
    const { record } = await getServerMount(port);
    const rows = listPasswordsForUserPort(userId, port);
    if (rows.length >= MAX_SLOTS) {
      return fail(res, 400, '每个服务器最多 1 个密码');
    }

    // 新密码固定使用 slot=1；历史 slot=2 记录不迁移、照实保留
    const slot = 1;

    // 2022-blake3-aes-128-gcm 需要 16 字节密钥，其余 2022 方法为 32 字节
    const keyLength = (record.method as string).includes('128') ? 16 : 32;
    const psk = crypto.randomBytes(keyLength).toString('base64');
    const subscriptionToken = crypto.randomBytes(32).toString('base64url');
    const ssName = `ssm_u${userId}_p${slot}`;

    const agePrivateKey = await age.generateIdentity();
    const agePublicKey = await age.identityToRecipient(agePrivateKey);

    let id;
    try {
      id = insertPassword({
        userId,
        serverPort: port,
        slot,
        ssName,
        password: psk,
        subscriptionToken,
        agePrivateKey,
        agePublicKey,
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return fail(res, 400, '密码槽位已被占用，请重试');
      }
      throw err;
    }

    try {
      await applyFromDb(port);
    } catch (err) {
      deletePassword(id);
      return sendServiceError(res, err);
    }

    const url = subscriptionUrl(subscriptionToken);
    return okEncrypted(res, req.session, {
      id,
      slot,
      password: psk,
      url,
      plainUrl: `${url}?plain=1`,
      agePrivateKey,
      agePublicKey,
    });
  } catch (err) {
    return sendServiceError(res, err);
  }
});

// POST /api/user/passwords/remove {id}
router.post('/passwords/remove', requireAuth, requireUserSession, decryptRequest, async (req, res) => {
  const userId = req.session.userId;
  const id = Number(req.body?.id);

  if (!Number.isInteger(id)) {
    return fail(res, 400, '密码 ID 无效');
  }

  const row = getPasswordById(id);
  if (!row || row.user_id !== userId) {
    return fail(res, 400, '密码不存在');
  }

  deletePassword(id);
  try {
    await applyFromDb(row.server_port);
  } catch (err) {
    restorePasswordRow(row);
    return sendServiceError(res, err);
  }

  return okEncrypted(res, req.session, { ok: true });
});

export default router;
