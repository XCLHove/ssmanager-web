/**
 * 流量采样器（仅内存）。
 *
 * ssmanager 的 `ping` 只提供每端口累计总字节（无方向拆分）。每 1 秒采样一次，
 * 每端口保留最近 300 个样本（约 5 分钟）；端口消失后样本保留 5 分钟再清理。
 * 上一次采样未完成（ping 超时）时跳过本轮，避免任务堆积。
 */

import { managerClient } from '../managerClient.js';

export interface TrafficSample {
  t: number;
  total: number;
}

export interface TrafficPoint {
  t: number;
  rate: number;
  total: number;
  reset: boolean;
}

export interface TrafficHistory {
  samples: TrafficPoint[];
  latest: { t: number; rate: number; total: number } | null;
}

const MAX_SAMPLES = 300;
const RETENTION_MS = 5 * 60 * 1000;

interface PortState {
  samples: TrafficSample[];
  lastSeen: number;
}

const ports = new Map<number, PortState>();

let interval: NodeJS.Timeout | null = null;
let sampling = false;
let managerReachable: boolean | null = null;

function logReachability(reachable: boolean): void {
  if (managerReachable === reachable) return;
  if (reachable && managerReachable === false) {
    console.log('[trafficSampler] ssmanager 已恢复，继续采样');
  } else if (!reachable) {
    console.warn('[trafficSampler] ssmanager 不可达，暂停采样');
  }
  managerReachable = reachable;
}

async function sampleOnce(): Promise<void> {
  if (sampling) return;
  sampling = true;

  try {
    const stats = await managerClient.pingStats();
    logReachability(true);

    const now = Date.now();
    for (const [portKey, total] of Object.entries(stats)) {
      const port = Number(portKey);
      if (!Number.isInteger(port) || port < 1 || port > 65535) continue;

      let state = ports.get(port);
      if (!state) {
        state = { samples: [], lastSeen: now };
        ports.set(port, state);
      }

      state.samples.push({ t: now, total });
      if (state.samples.length > MAX_SAMPLES) {
        state.samples.splice(0, state.samples.length - MAX_SAMPLES);
      }
      state.lastSeen = now;
    }

    // 端口消失后保留 5 分钟，再清理
    for (const [port, state] of ports) {
      if (now - state.lastSeen > RETENTION_MS) {
        ports.delete(port);
      }
    }
  } catch {
    logReachability(false);
  } finally {
    sampling = false;
  }
}

/** 启动采样（默认 1 秒）；重复调用无副作用 */
export function startTrafficSampler(intervalMs = 1000): void {
  if (interval) return;
  void sampleOnce();
  interval = setInterval(() => {
    void sampleOnce();
  }, intervalMs);
  interval.unref();
}

export function stopTrafficSampler(): void {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}

/**
 * 返回最近 seconds 秒的历史点。
 * 首点速率使用窗口前最近一个样本作为基准；窗口内无样本时返回空。
 */
export function getTrafficHistory(port: number, seconds: number): TrafficHistory {
  const state = ports.get(Number(port));
  if (!state || state.samples.length === 0) {
    return { samples: [], latest: null };
  }

  const windowStart = Date.now() - seconds * 1000;
  const list = state.samples;

  let startIndex = -1;
  for (let i = 0; i < list.length; i += 1) {
    if (list[i].t >= windowStart) {
      startIndex = i;
      break;
    }
  }
  if (startIndex === -1) {
    return { samples: [], latest: null };
  }

  let baseline: TrafficSample | null = null;
  for (let i = startIndex - 1; i >= 0; i -= 1) {
    if (list[i].t < windowStart) {
      baseline = list[i];
      break;
    }
  }

  const samples: TrafficPoint[] = [];
  let prev: TrafficSample | null = baseline;

  for (let i = startIndex; i < list.length; i += 1) {
    const current = list[i];
    let rate = 0;
    let reset = false;

    if (prev) {
      const dt = current.t - prev.t;
      if (current.total < prev.total) {
        reset = true;
        rate = 0;
      } else if (dt > 0) {
        rate = Math.max(0, ((current.total - prev.total) / dt) * 1000);
      }
    }

    samples.push({ t: current.t, rate, total: current.total, reset });
    prev = current;
  }

  const last = samples[samples.length - 1];
  return {
    samples,
    latest: last ? { t: last.t, rate: last.rate, total: last.total } : null,
  };
}
