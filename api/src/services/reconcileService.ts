/**
 * SQLite → ssmanager 对账服务。
 *
 * ssmanager 不持久化动态 add 的服务器，重启即清空；本地 SQLite 是事实来源。
 * 双向对账：本地有、管理器缺失的端口会被重建；管理器有、本地无记录的端口会被移除。
 * 管理器不可达时直接返回，不修改任何数据，等待下一次调度。
 */

import { managerClient } from '../managerClient.js';
import { getAllServerConfigs, getServerConfig } from '../serverStore.js';
import { applyFromDb, withServerQueue } from './serverUsersService.js';

export interface ReconcileFailure {
  port: number;
  error: string;
}

export interface ReconcileResult {
  managerReachable: boolean;
  running: number;
  local: number;
  restored: number[];
  removed: number[];
  failed: ReconcileFailure[];
}

export interface ReconcileOptions {
  /** 是否输出单端口恢复成功/失败日志，默认 true */
  log?: boolean;
}

/** 模块级 in-flight Promise，防止定时器与启动调用并发重入 */
let inFlight: Promise<ReconcileResult> | null = null;
/** 已记录过失败的端口，避免管理器持续不可用/单端口持续失败时每 30 秒刷屏 */
const failedLogged = new Set<number>();

async function doReconcile(log: boolean): Promise<ReconcileResult> {
  const localPorts = Object.keys(getAllServerConfigs())
    .map(Number)
    .filter((port) => Number.isInteger(port) && port >= 1 && port <= 65535)
    .sort((a, b) => a - b);

  let runningPorts: number[];
  try {
    runningPorts = await managerClient.listPorts();
  } catch {
    // 管理器未启动/Docker 启动顺序等原因：不修改数据，交给下一次调度
    return {
      managerReachable: false,
      running: 0,
      local: localPorts.length,
      restored: [],
      removed: [],
      failed: [],
    };
  }

  const runningSet = new Set(runningPorts);
  const localSet = new Set(localPorts);
  const missing = localPorts.filter((port) => !runningSet.has(port));
  const extra = runningPorts
    .filter((port) => !localSet.has(port))
    .sort((a, b) => a - b);
  const restored: number[] = [];
  const removed: number[] = [];
  const failed: ReconcileFailure[] = [];

  for (const port of missing) {
    try {
      await applyFromDb(port);
      restored.push(port);
      failedLogged.delete(port);
      if (log) {
        console.log(`[reconcile] 已恢复端口 ${port}`);
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      failed.push({ port, error: message });
      if (log && !failedLogged.has(port)) {
        failedLogged.add(port);
        console.error(`[reconcile] 恢复端口 ${port} 失败: ${message}`);
      }
    }
  }

  // 本地无记录但管理器有端口：以 SQLite 为准，全部移除（先告警）
  if (log && localPorts.length === 0 && extra.length > 0) {
    console.warn(
      `[reconcile] 本地无服务器记录，将移除 ssmanager 中全部 ${extra.length} 个端口（请确认 dataDir 配置/挂载正确）`
    );
  }

  for (const port of extra) {
    try {
      // 与 users 重建共用全局串行队列；移除前再查一次本地记录，避免并发新增被误删
      const didRemove = await withServerQueue(async () => {
        if (getServerConfig(port)) return false;
        await managerClient.removeServer(port);
        return true;
      });

      if (didRemove) {
        removed.push(port);
        failedLogged.delete(port);
        if (log) {
          console.log(`[reconcile] 已移除未登记端口 ${port}`);
        }
      }
    } catch (err: any) {
      const message = err?.message || String(err);
      failed.push({ port, error: message });
      if (log && !failedLogged.has(port)) {
        failedLogged.add(port);
        console.error(`[reconcile] 移除未登记端口 ${port} 失败: ${message}`);
      }
    }
  }

  // 已不再缺失/多余的端口清除失败记录，便于下次真正失败时重新输出
  for (const port of [...failedLogged]) {
    if (!missing.includes(port) && !extra.includes(port)) {
      failedLogged.delete(port);
    }
  }

  return {
    managerReachable: true,
    running: runningPorts.length,
    local: localPorts.length,
    restored,
    removed,
    failed,
  };
}

export function reconcileServers(options: ReconcileOptions = {}): Promise<ReconcileResult> {
  if (inFlight) return inFlight;

  const log = options.log !== false;
  inFlight = doReconcile(log).finally(() => {
    inFlight = null;
  });
  return inFlight;
}
