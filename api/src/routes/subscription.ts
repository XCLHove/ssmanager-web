import { Router } from 'express';
import * as age from 'age-encryption';
import { config } from '../config.js';
import { managerClient } from '../managerClient.js';
import { getServerRecord } from '../serverStore.js';
import { findSubscriptionByToken } from '../stores/passwordStore.js';
import { TemplateError, renderForPassword } from '../services/templateService.js';

const router = Router();

function notFound(res) {
  return res.status(404).type('text/plain').send('not found');
}

async function resolveServerPsk(record) {
  if (record.password) return record.password;
  const servers = await managerClient.listServers();
  return servers.find((item) => item.port === record.port)?.password ?? null;
}

// GET /sub/:token（公开、非信封）
router.get('/:token', async (req, res) => {
  try {
    const row = findSubscriptionByToken(req.params.token);
    if (!row || row.user_enabled !== 1) {
      return notFound(res);
    }

    const record = getServerRecord(row.server_port);
    if (!record || !record.method) {
      return notFound(res);
    }

    const serverPsk = await resolveServerPsk(record);
    if (!serverPsk) {
      return notFound(res);
    }

    const ctx = {
      server: {
        port: record.port,
        host: config.publicHost,
        method: record.method,
        mode: record.mode,
        noDelay: record.noDelay,
        plugin: record.plugin,
        pluginOpts: record.pluginOpts,
        pluginMode: record.pluginMode,
        password: serverPsk,
      },
      user: { id: row.user_id, username: row.username },
      password: {
        id: row.id,
        slot: row.slot,
        psk: row.password,
        name: row.ss_name,
      },
      token: req.params.token,
      generatedAt: Date.now(),
      format: 'clash',
    };

    const yaml = renderForPassword(record.port, ctx);

    const plain = req.query.plain === '1' || req.query.plain === 'true';
    if (!plain && row.age_public_key) {
      try {
        const encrypter = new age.Encrypter();
        encrypter.addRecipient(row.age_public_key);
        const ciphertext = await encrypter.encrypt(yaml);
        const armored = age.armor.encode(ciphertext);

        res.set({
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="ssmanager-${record.port}.yaml.age"`,
          'Cache-Control': 'no-store',
          'profile-update-interval': '24',
          'X-Content-Type-Options': 'nosniff',
        });
        return res.status(200).send(armored);
      } catch (err: any) {
        console.error('[sub] age 加密失败:', err?.message || err);
        return res.status(500).type('text/plain').send('订阅加密失败');
      }
    }

    res.set({
      'Content-Type': 'text/yaml; charset=utf-8',
      'Content-Disposition': `attachment; filename="ssmanager-${record.port}.yaml"`,
      'Cache-Control': 'no-store',
      'profile-update-interval': '24',
      'X-Content-Type-Options': 'nosniff',
    });
    return res.status(200).send(yaml);
  } catch (err) {
    if (err instanceof TemplateError) {
      return res.status(500).type('text/plain').send('模板渲染失败');
    }
    console.error('[sub] 订阅生成失败:', err.message);
    return notFound(res);
  }
});

export default router;
