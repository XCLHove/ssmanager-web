import { Router } from 'express';
import { managerClient, ManagerError } from '../managerClient.js';
import { requireAuth, requireAdmin, decryptRequest } from '../middleware/auth.js';
import { okEncrypted, fail } from '../response.js';
import { serverHasGrantsOrPasswords } from '../stores/grantStore.js';
import { countPasswordsForPort } from '../stores/passwordStore.js';
import { findUsernamesByIds } from '../stores/userStore.js';
import { ServerUsersError, applyWithConfig } from '../services/serverUsersService.js';
import {
  getAllServerConfigs,
  getServerConfig,
  saveServerConfig,
  removeServerConfig,
} from '../serverStore.js';

const router = Router();

/** 把 ssmanager / 重建错误映射为统一信封 */
function sendManagerError(res, err) {
  if (err instanceof ServerUsersError) {
    return fail(res, err.code, err.message);
  }
  if (err instanceof ManagerError) {
    return fail(res, 502, err.message);
  }
  console.error('[servers] 未预期的错误:', err);
  return fail(res, 500, '服务器内部错误');
}

function isValidPort(value) {
  return Number.isInteger(value) && value >= 1 && value <= 65535;
}

/** 可选文本字段：未填（非字符串或空白）时返回 undefined，不写入发给 ssmanager 的 JSON */
function optionalText(value) {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

/** 合并高级字段：overrides 中为 undefined 的字段不覆盖 base（update 沿用本地记录） */
function mergeOptions(base: any, overrides: any): any {
  const merged: any = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/**
 * 校验并归一化服务器配置（add / update 共用）。
 * defaultPort 仅 update 使用：body 未提供 port 时沿用原端口。
 * 返回 { error } 或 { value: { port, password, options } }。
 */
function parseServerConfig(body: any, defaultPort?: number): any {
  const { port, password, method, noDelay, plugin, pluginOpts, pluginMode, mode } = body ?? {};
  const portNum = Number(port ?? defaultPort);

  if (!isValidPort(portNum)) {
    return { error: '端口必须是 1-65535 之间的整数' };
  }
  if (typeof password !== 'string' || password.length === 0) {
    return { error: '密码不能为空' };
  }
  if (password.length > 256) {
    return { error: '密码过长（最多 256 字符）' };
  }

  // 手工 users 已废弃：托管用户仅来自 DB（见 serverUsersService）
  return {
    value: {
      port: portNum,
      password,
      options: {
        method: optionalText(method),
        noDelay,
        plugin: optionalText(plugin),
        pluginOpts: optionalText(pluginOpts),
        pluginMode: optionalText(pluginMode),
        mode: optionalText(mode),
      },
    },
  };
}

// POST /api/servers/list → data { ports, servers }
// list 不回显的高级字段从本地记录合并；无记录的端口 configKnown 为 false
router.post('/list', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  try {
    const servers = await managerClient.listServers();

    // 托管用户名形如 ssm_u<userId>_p<slot>，批量补充真实 username
    const userIds = new Set();
    for (const server of servers) {
      for (const user of server.users ?? []) {
        const match = /^ssm_u(\d+)_p\d+$/.exec(user.name);
        if (match) userIds.add(Number(match[1]));
      }
    }
    const usernames = findUsernamesByIds([...userIds]);
    const serversWithUsernames = servers.map((server) => {
      if (!server.users) return server;
      return {
        ...server,
        users: server.users.map((user) => {
          const match = /^ssm_u(\d+)_p\d+$/.exec(user.name);
          const username = match ? usernames.get(Number(match[1])) : undefined;
          return username ? { ...user, username } : user;
        }),
      };
    });

    const records = getAllServerConfigs();
    const merged = serversWithUsernames.map((server) => {
      const record = records[String(server.port)];
      return record
        ? { ...server, ...record, port: server.port, configKnown: true }
        : { ...server, configKnown: false };
    });
    return okEncrypted(res, req.session, {
      ports: merged.map((server) => server.port),
      servers: merged,
    });
  } catch (err) {
    return sendManagerError(res, err);
  }
});

// POST /api/servers/add
// body { port, password, method?, noDelay?, plugin?, pluginOpts?, pluginMode?, mode?, users? }
router.post('/add', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  const { error, value } = parseServerConfig(req.body);
  if (error) {
    return fail(res, 400, error);
  }

  try {
    await applyWithConfig({
      port: value.port,
      config: value.options,
      mainPassword: value.password,
    });
    saveServerConfig(value.port, value.options, { password: value.password });
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    return sendManagerError(res, err);
  }
});

// POST /api/servers/update
// body { originalPort, ...新配置 }；新配置的 port 为可选新端口，缺省沿用 originalPort。
// ssmanager 协议没有 update：remove 旧端口后 add 新配置；add 失败不回滚。
router.post('/update', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  const oldPort = Number(req.body?.originalPort);
  if (!isValidPort(oldPort)) {
    return fail(res, 400, '原端口必须是 1-65535 之间的整数');
  }

  const { error, value } = parseServerConfig(req.body, oldPort);
  if (error) {
    return fail(res, 400, error);
  }

  // 有授权/密码的服务器禁止改端口（靠外键关联，改端口会破坏关联）
  if (value.port !== oldPort && serverHasGrantsOrPasswords(oldPort)) {
    return fail(res, 400, '服务器存在授权或密码，不能修改端口');
  }

  // 已有本地记录时，未提交的高级字段沿用记录（例如只改密码时保留 method）。
  // 外部服务器无记录，则只按本次提交的字段 add。
  const options = mergeOptions(getServerConfig(oldPort) ?? {}, value.options);

  // 已有生成密码时，禁止改成非 2022 方法（用户密码只能挂载在 2022-blake3-* 上）
  if (
    countPasswordsForPort(oldPort) > 0 &&
    (!options.method || !options.method.startsWith('2022-blake3-'))
  ) {
    return fail(res, 400, '该服务器已有用户密码，不能改为非 2022-blake3-* 方法');
  }

  try {
    await applyWithConfig({
      port: value.port,
      config: options,
      mainPassword: value.password,
    });
    if (value.port !== oldPort) {
      // 端口变化才删除旧记录；同端口不能 DELETE（外键会级联删掉授权/密码）
      removeServerConfig(oldPort);
    }
    saveServerConfig(value.port, options, { password: value.password });
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    return sendManagerError(res, err);
  }
});

// POST /api/servers/remove → body { port }
router.post('/remove', requireAuth, requireAdmin, decryptRequest, async (req, res) => {
  const portNum = Number(req.body?.port);
  if (!isValidPort(portNum)) {
    return fail(res, 400, '端口必须是 1-65535 之间的整数');
  }

  try {
    await managerClient.removeServer(portNum);
    removeServerConfig(portNum);
    return okEncrypted(res, req.session, { ok: true });
  } catch (err) {
    return sendManagerError(res, err);
  }
});

export default router;
