import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 配置/数据根目录：源码运行时为 api/src/..，打包后为 <root>/dist/server.mjs 的上一级。
 * 不再支持环境变量覆盖。
 */
export const PACKAGE_ROOT = path.resolve(__dirname, '..');

/** 前端构建产物目录：固定 <root>/../ui/dist */
export const UI_DIST_DIR = path.resolve(PACKAGE_ROOT, '..', 'ui', 'dist');

const CONFIG_HINT =
  '请使用 -c <配置文件路径> 指定配置文件（也可使用 --config <path> 或 --config=<path>）';

/**
 * 解析命令行配置文件参数（必填）：
 *   -c <path> / --config <path> / --config=<path>
 * 相对路径按当前工作目录解析。
 */
function resolveConfigFileArg(argv: string[]): string {
  let explicitPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-c' || arg === '--config') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        console.error(`[config] 参数 ${arg} 缺少配置文件路径；${CONFIG_HINT}`);
        process.exit(1);
      }
      explicitPath = path.resolve(value);
      i += 1;
    } else if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (value === '') {
        console.error(`[config] 参数 --config= 缺少配置文件路径；${CONFIG_HINT}`);
        process.exit(1);
      }
      explicitPath = path.resolve(value);
    }
  }

  if (!explicitPath) {
    console.error(`[config] ${CONFIG_HINT}`);
    process.exit(1);
  }
  return explicitPath;
}

const CONFIG_FILE = resolveConfigFileArg(process.argv.slice(2));

function loadConfigFile(filePath: string): Record<string, any> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      console.error(`[config] 配置文件内容必须是 JSON 对象: ${filePath}`);
      process.exit(1);
    }
    return parsed;
  } catch (err: any) {
    console.error(`[config] 读取配置文件失败: ${filePath} (${err.message})`);
    process.exit(1);
  }
}

const fileConfig = loadConfigFile(CONFIG_FILE);

/** 配置文件值 > 内置默认值（空字符串视为未设置） */
function valueOrDefault(fileValue: any, defaultValue: any): any {
  if (fileValue !== undefined && fileValue !== null && fileValue !== '') return fileValue;
  return defaultValue;
}

function toPort(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function toTimeoutMs(value: any, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const DEFAULT_MANAGER_HOST = '127.0.0.1';
const DEFAULT_MANAGER_PORT = 6100;
const DEFAULT_MANAGER_ADDRESS = `${DEFAULT_MANAGER_HOST}:${DEFAULT_MANAGER_PORT}`;

/**
 * 解析 ssmanagerAddress，支持三种形式：
 *   1. host:port（UDP）：127.0.0.1:6100、localhost:6100、[::1]:6100
 *      省略端口时默认 6100；端口非法时回退 6100；
 *      未写端口的 host 仅接受 IP、localhost 或含点域名。
 *   2. unix:/path 或 unix:///path（Unix datagram socket）
 *   3. 以 /、./、../ 开头的裸路径（Unix datagram socket）
 * 非法路径/空值告警并回退 127.0.0.1:6100。
 */
interface ManagerTarget {
  protocol: 'udp' | 'unix';
  host: string | null;
  port: number | null;
  socketPath: string | null;
}

function parseManagerAddress(value: any): ManagerTarget {
  const raw = String(value ?? '').trim();

  let socketPath: string | undefined;
  if (/^unix:/i.test(raw)) {
    socketPath = raw.slice(5);
    if (socketPath.startsWith('//')) {
      socketPath = socketPath.replace(/^\/+/, '/');
    }
    socketPath = socketPath.trim();
  } else if (raw.startsWith('/') || raw.startsWith('./') || raw.startsWith('../')) {
    socketPath = raw;
  }

  if (socketPath !== undefined) {
    if (!socketPath || socketPath.includes('\0')) {
      console.warn(
        `[config] ssmanagerAddress Unix socket 路径无效: "${raw}"，已回退默认 ${DEFAULT_MANAGER_ADDRESS}`
      );
      return {
        protocol: 'udp',
        host: DEFAULT_MANAGER_HOST,
        port: DEFAULT_MANAGER_PORT,
        socketPath: null,
      };
    }
    return { protocol: 'unix', host: null, port: null, socketPath };
  }

  let host = raw;
  let portText: string | null = null;

  if (raw.startsWith('[')) {
    const end = raw.indexOf(']');
    if (end !== -1) {
      host = raw.slice(1, end);
      const rest = raw.slice(end + 1);
      if (rest.startsWith(':')) {
        portText = rest.slice(1);
      } else if (rest.length > 0) {
        portText = rest;
      }
    }
  } else {
    const first = raw.indexOf(':');
    const last = raw.lastIndexOf(':');
    if (first !== -1 && first === last) {
      host = raw.slice(0, first);
      portText = raw.slice(first + 1);
    }
  }

  host = host.trim();
  if (!host) {
    console.warn(`[config] ssmanagerAddress 无效: "${raw}"，已回退默认 ${DEFAULT_MANAGER_ADDRESS}`);
    return {
      protocol: 'udp',
      host: DEFAULT_MANAGER_HOST,
      port: DEFAULT_MANAGER_PORT,
      socketPath: null,
    };
  }

  if (portText !== null) {
    const port = Number(portText);
    if (/^\d+$/.test(portText) && Number.isInteger(port) && port >= 1 && port <= 65535) {
      return { protocol: 'udp', host, port, socketPath: null };
    }
    console.warn(
      `[config] ssmanagerAddress 端口无效: "${raw}"，已回退默认端口 ${DEFAULT_MANAGER_PORT}`
    );
    return { protocol: 'udp', host, port: DEFAULT_MANAGER_PORT, socketPath: null };
  }

  const hostOnlyValid =
    host.toLowerCase() === 'localhost' || isIP(host) !== 0 || host.includes('.');
  if (!hostOnlyValid) {
    console.warn(`[config] ssmanagerAddress 无效: "${raw}"，已回退默认 ${DEFAULT_MANAGER_ADDRESS}`);
    return {
      protocol: 'udp',
      host: DEFAULT_MANAGER_HOST,
      port: DEFAULT_MANAGER_PORT,
      socketPath: null,
    };
  }

  return { protocol: 'udp', host, port: DEFAULT_MANAGER_PORT, socketPath: null };
}

/** 本地 SQLite 数据目录：配置文件 dataDir > 默认 data（相对路径基于 PACKAGE_ROOT） */
const rawDataDir = String(valueOrDefault(fileConfig.dataDir, 'data'));
export const DATA_DIR = path.isAbsolute(rawDataDir)
  ? rawDataDir
  : path.resolve(PACKAGE_ROOT, rawDataDir);

const managerAddressParts = parseManagerAddress(
  valueOrDefault(fileConfig.ssmanagerAddress, DEFAULT_MANAGER_ADDRESS)
);

export const config = {
  /** 登录账户 */
  username: String(valueOrDefault(fileConfig.username, 'admin')),
  password: String(valueOrDefault(fileConfig.password, 'admin123')),

  /** ssmanager 通信方式：'udp' | 'unix' */
  managerProtocol: managerAddressParts.protocol,
  /** UDP 模式：host（不带方括号）与端口；Unix 模式为 null */
  managerAddress: managerAddressParts.host,
  managerPort: managerAddressParts.port,
  /** Unix 模式：datagram socket 路径；UDP 模式为 null */
  managerSocketPath: managerAddressParts.socketPath,

  /** Web 服务 */
  webHost: String(valueOrDefault(fileConfig.webHost, '0.0.0.0')),
  webPort: toPort(valueOrDefault(fileConfig.webPort, 3000), 3000),

  /** 登录会话有效期（沿用原配置键，不涉及 JWT） */
  jwtExpiresIn: String(valueOrDefault(fileConfig.jwtExpiresIn, '12h')),

  /** 本地数据目录（已解析为绝对路径；SQLite 文件为 <dataDir>/ssmanager-web.db） */
  dataDir: DATA_DIR,

  /** 客户端可见的公网主机（订阅/节点地址使用） */
  publicHost: String(valueOrDefault(fileConfig.publicHost, '127.0.0.1')),

  /**
   * 订阅 URL 的兜底基础地址（可空）。
   * 配置后后端返回绝对 URL；为空时返回相对路径，由前端按当前页面地址补全。
   */
  publicBaseUrl: String(valueOrDefault(fileConfig.publicBaseUrl, '')),

  /** 与 ssmanager 通信的超时（毫秒） */
  managerTimeoutMs: toTimeoutMs(valueOrDefault(fileConfig.managerTimeoutMs, 3000), 3000),

  /** GitHub 仓库（owner/repo），用于检查最新 Release */
  githubRepo: String(valueOrDefault(fileConfig.githubRepo, 'XCLHove/ssmanager-web')),

  /** GitHub Token（可选；私有仓库或提高 API 限额时配置） */
  githubToken: String(valueOrDefault(fileConfig.githubToken, '')),
};

/** ssmanager 地址的规范化表示：UDP 为 host:port（IPv6 加方括号），Unix 为 unix:<path> */
export function managerAddressString() {
  if (config.managerProtocol === 'unix') {
    return `unix:${config.managerSocketPath}`;
  }
  const address = config.managerAddress ?? '';
  const host = address.includes(':') ? `[${address}]` : address;
  return `${host}:${config.managerPort}`;
}
