import { createApp } from './app.js';
import { config, managerAddressString } from './config.js';

const app = createApp();

const server = app.listen(config.webPort, config.webHost, () => {
  console.log('ssmanager-web API 已启动');
  console.log(`  监听地址:   http://${config.webHost}:${config.webPort}`);
  const managerTarget =
    config.managerProtocol === 'unix' ? managerAddressString() : `udp://${managerAddressString()}`;
  console.log(`  ssmanager:  ${managerTarget} (超时 ${config.managerTimeoutMs}ms)`);
  console.log(`  登录账户:   ${config.username}`);
  console.log(`  会话有效期: ${config.jwtExpiresIn}`);
});

function shutdown(signal) {
  console.log(`\n收到 ${signal}，正在关闭...`);
  server.close(() => process.exit(0));
  // 兜底：若 5 秒内未能正常关闭则强制退出
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
