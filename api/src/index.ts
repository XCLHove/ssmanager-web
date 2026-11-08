import { createApp } from './app.js';
import { config, managerAddressString } from './config.js';
import { reconcileServers } from './services/reconcileService.js';
import { startTrafficSampler, stopTrafficSampler } from './services/trafficSampler.js';

const app = createApp();

const RECONCILE_INTERVAL_MS = 30_000;
let reconcileTimer: NodeJS.Timeout | null = null;
let lastManagerReachable: boolean | null = null;

async function runReconcile(): Promise<void> {
  try {
    const result = await reconcileServers();
    if (result.managerReachable !== lastManagerReachable) {
      if (result.managerReachable) {
        console.log(
          `[reconcile] ssmanager 已连接（运行 ${result.running} 个端口，本地记录 ${result.local} 个）`
        );
      } else {
        console.warn('[reconcile] ssmanager 不可达，暂缓对账；将在后续周期自动重试');
      }
      lastManagerReachable = result.managerReachable;
    }
  } catch (err: any) {
    console.error('[reconcile] 对账异常:', err?.message || err);
  }
}

const server = app.listen(config.webPort, config.webHost, () => {
  console.log('ssmanager-web API 已启动');
  console.log(`  监听地址:   http://${config.webHost}:${config.webPort}`);
  const managerTarget =
    config.managerProtocol === 'unix' ? managerAddressString() : `udp://${managerAddressString()}`;
  console.log(`  ssmanager:  ${managerTarget} (超时 ${config.managerTimeoutMs}ms)`);
  console.log(`  登录账户:   ${config.username}`);
  console.log(`  会话有效期: ${config.jwtExpiresIn}`);
  console.log(`  持久化对账: 启动时 + 每 ${RECONCILE_INTERVAL_MS / 1000} 秒`);

  void runReconcile();
  reconcileTimer = setInterval(() => {
    void runReconcile();
  }, RECONCILE_INTERVAL_MS);
  reconcileTimer.unref();

  startTrafficSampler();
});

function shutdown(signal: string) {
  console.log(`\n收到 ${signal}，正在关闭...`);
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  stopTrafficSampler();
  server.close(() => process.exit(0));
  // 兜底：若 5 秒内未能正常关闭则强制退出
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
