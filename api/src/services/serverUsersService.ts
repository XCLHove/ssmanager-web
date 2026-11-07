/**
 * ssmanager 多用户（2022-blake3-* EIH users）重建服务。
 *
 * users 仅来自 DB（user_server_passwords），名称固定 `ssm_u<userId>_p<slot>`。
 * 每次变更执行：list 读取旧 users → removeServer → 短延迟 → addServer(主PSK + DB users)，
 * addServer 内部会 list 复核。失败时尝试用旧 users 恢复。
 *
 * 并发：所有重建走全局串行队列，并对同一端口额外用 Promise 锁合并。
 */

import { managerClient } from '../managerClient.js';
import { getServerRecord } from '../serverStore.js';
import { listPasswordsForPort } from '../stores/passwordStore.js';
import type { ServerOptions, ServerRecord, ServerUser } from '../types/models.js';

export class ServerUsersError extends Error {
  readonly code: number;

  constructor(code: number, message: string) {
    super(message);
    this.name = 'ServerUsersError';
    this.code = code;
  }
}

const REBUILD_DELAY_MS = 120;
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** port → Promise（同端口串行） */
const portLocks = new Map<number, Promise<any>>();
/** 全局串行队列 */
let globalQueue: Promise<any> = Promise.resolve();

function withPortLock(port: number, task: () => Promise<any>): Promise<any> {
  const key = Number(port);
  const previous = portLocks.get(key) ?? Promise.resolve();

  const queued = previous.catch(() => {}).then(() => {
    const run = globalQueue.then(task, task);
    globalQueue = run.catch(() => {});
    return run;
  });

  const tracked = queued.catch(() => {});
  portLocks.set(key, tracked);
  tracked.finally(() => {
    if (portLocks.get(key) === tracked) {
      portLocks.delete(key);
    }
  });

  return queued;
}

/** 当前端口的托管 users（仅 DB） */
function managedUsers(port: number): ServerUser[] {
  return listPasswordsForPort(port).map((row: any) => ({
    name: `ssm_u${row.user_id}_p${row.slot}`,
    password: row.password,
  }));
}

function buildAddOptions(config: ServerOptions, users: ServerUser[]) {
  return {
    method: config.method,
    noDelay: config.noDelay,
    plugin: config.plugin,
    pluginOpts: config.pluginOpts,
    pluginMode: config.pluginMode,
    mode: config.mode,
    users: users.length > 0 ? users : undefined,
  };
}

/** 主 PSK 优先本地记录，缺失时回退 manager list */
async function resolveMainPassword(port: number, record: ServerRecord | null) {
  if (record?.password) return record.password;

  const servers = await managerClient.listServers();
  const entry = servers.find((item) => item.port === Number(port));
  if (entry?.password) return entry.password;

  throw new ServerUsersError(400, `端口 ${port} 缺少服务器主密码`);
}

async function applyInternal(
  port: number,
  config: ServerOptions,
  mainPassword: string
): Promise<boolean> {
  const users = managedUsers(port);
  if (users.length > 0 && (!config.method || !config.method.startsWith('2022-blake3-'))) {
    throw new ServerUsersError(400, '该服务器已有用户密码，不能使用非 2022-blake3-* 方法');
  }

  const servers = await managerClient.listServers();
  const oldUsers = servers.find((item) => item.port === Number(port))?.users ?? [];

  await managerClient.removeServer(port);
  await delay(REBUILD_DELAY_MS);

  try {
    await managerClient.addServer(port, mainPassword, buildAddOptions(config, users));
    return true;
  } catch (err) {
    try {
      await managerClient.removeServer(port);
      await delay(REBUILD_DELAY_MS);
      await managerClient.addServer(port, mainPassword, buildAddOptions(config, oldUsers));
    } catch (restoreErr) {
      throw new ServerUsersError(
        502,
        `重建失败且恢复原配置失败: ${err.message}; ${restoreErr.message}；请调用 /api/admin/servers/reapply 重试`
      );
    }
    throw new ServerUsersError(502, `重建失败: ${err.message}（已恢复原配置）`);
  }
}

/** 使用本地记录中的配置与 DB users 重建（用户密码增删/撤销授权/reapply 使用） */
export async function applyFromDb(port: number): Promise<boolean> {
  return withPortLock(port, async () => {
    const record = getServerRecord(port);
    if (!record) {
      throw new ServerUsersError(400, '服务器不存在或缺少本地配置');
    }
    if (!record.method || !record.method.startsWith('2022-blake3-')) {
      throw new ServerUsersError(400, '仅 2022-blake3-* 服务器支持托管用户');
    }
    const mainPassword = await resolveMainPassword(port, record);
    await applyInternal(port, record, mainPassword);
    return true;
  });
}

/** 管理员 add/update 统一应用：使用请求中的配置 + DB 中的 users */
export async function applyWithConfig({
  port,
  config,
  mainPassword,
}: {
  port: number;
  config: ServerOptions;
  mainPassword: string;
}): Promise<boolean> {
  if (typeof mainPassword !== 'string' || mainPassword.length === 0) {
    throw new ServerUsersError(400, '服务器主密码不能为空');
  }
  return withPortLock(port, () => applyInternal(port, config, mainPassword));
}

/** 读取可用于生成用户密码的挂载信息（端口必须存在本地配置且为 2022） */
export async function getServerMount(
  port: number
): Promise<{ record: ServerRecord; mainPassword: string }> {
  const record = getServerRecord(port);
  if (!record) {
    throw new ServerUsersError(400, '服务器不存在或缺少本地配置');
  }
  if (!record.method || !record.method.startsWith('2022-blake3-')) {
    throw new ServerUsersError(400, '仅 2022-blake3-* 服务器支持生成密码');
  }
  const mainPassword = await resolveMainPassword(port, record);
  return { record, mainPassword };
}
