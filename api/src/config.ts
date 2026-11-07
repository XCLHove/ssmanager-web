import fs from 'node:fs';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';

// 支持 .env 文件（环境变量优先级最高）
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 配置/数据根目录。
 * 源码运行时为 api/src/..，打包后为 <root>/dist/server.mjs 的上一级。
 * 可用 SSMANAGER_ROOT 覆盖，便于独立部署布局。
 */
export const PACKAGE_ROOT = process.env.SSMANAGER_ROOT
  ? path.resolve(process.env.SSMANAGER_ROOT)
  : path.resolve(__dirname, '..');

/** 前端构建产物目录（默认 <root>/../ui/dist，可用 SSMANAGER_UI_DIR 覆盖） */
export const UI_DIST_DIR = process.env.SSMANAGER_UI_DIR
  ? path.resolve(process.env.SSMANAGER_UI_DIR)
  : path.resolve(PACKAGE_ROOT, '..', 'ui', 'dist');

/**
 * 解析命令行配置文件参数：
 *   -c <path> / --config <path> / --config=<path>
 * 相对路径按当前工作目录解析；参数缺值直接报错退出。
 * 未指定时使用默认 <api 根>/config.json。
 */
function resolveConfigFileArg(argv: string[]): string | null {
  let explicitPath: string | null = null;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '-c' || arg === '--config') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        console.error(`[config] 参数 ${arg} 缺少配置文件路径`);
        process.exit(1);
      }
      explicitPath = path.resolve(value);
      i += 1;
    } else if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (value === '') {
        console.error('[config] 参数 --config= 缺少配置文件路径');
        process.exit(1);
      }
      explicitPath = path.resolve(value);
    }
  }

  return explicitPath;
}

const configArgPath = resolveConfigFileArg(process.argv.slice(2));
const CONFIG_FILE = configArgPath ?? path.join(PACKAGE_ROOT, 'config.json');

function loadConfigFile(filePath: string, explicit: boolean): Record<string, any> {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      if (explicit) {
        console.error(`[config] 配置文件内容必须是 JSON 对象: ${filePath}`);
        process.exit(1);
      }
      return {};
    }
    return parsed;
  } catch (err: any) {
    if (explicit) {
      console.error(`[config] 读取配置文件失败: ${filePath} (${err.message})`);
      process.exit(1);
    }
    if (err.code !== 'ENOENT') {
      console.warn(`[config] 读取 config.json 失败，已忽略该文件: ${err.message}`);
    }
    return {};
  }
}

const fileConfig = loadConfigFile(CONFIG_FILE, configArgPath !== null);

/** 环境变量 > 配置文件 > 内置默认值 */
function pick(envValue: any, fileValue: any, defaultValue: any): any {
  if (envValue !== undefined && envValue !== '') return envValue;
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

/** 本地 SQLite 数据目录：环境变量 > config.json > 默认 data（相对路径基于 api 包目录） */
const rawDataDir = String(pick(process.env.SSMANAGER_DATA_DIR, fileConfig.dataDir, 'data'));
export const DATA_DIR = path.isAbsolute(rawDataDir)
  ? rawDataDir
  : path.resolve(PACKAGE_ROOT, rawDataDir);

const managerAddressParts = parseManagerAddress(
  pick(process.env.SSMANAGER_ADDRESS, fileConfig.ssmanagerAddress, DEFAULT_MANAGER_ADDRESS)
);

export const config = {
  /** 登录账户 */
  username: String(pick(process.env.SSMANAGER_WEB_USERNAME, fileConfig.username, 'admin')),
  password: String(pick(process.env.SSMANAGER_WEB_PASSWORD, fileConfig.password, 'admin123')),

  /** ssmanager 通信方式：'udp' | 'unix' */
  managerProtocol: managerAddressParts.protocol,
  /** UDP 模式：host（不带方括号）与端口；Unix 模式为 null */
  managerAddress: managerAddressParts.host,
  managerPort: managerAddressParts.port,
  /** Unix 模式：datagram socket 路径；UDP 模式为 null */
  managerSocketPath: managerAddressParts.socketPath,

  /** Web 服务 */
  webHost: String(pick(process.env.SSMANAGER_WEB_HOST, fileConfig.webHost, '0.0.0.0')),
  webPort: toPort(pick(process.env.SSMANAGER_WEB_PORT, fileConfig.webPort, 3000), 3000),

  /** 登录会话有效期（沿用原配置键，不涉及 JWT） */
  jwtExpiresIn: String(pick(process.env.SSMANAGER_WEB_TOKEN_TTL, fileConfig.jwtExpiresIn, '12h')),

  /** 本地数据目录（已解析为绝对路径；SQLite 文件为 <dataDir>/ssmanager-web.db） */
  dataDir: DATA_DIR,

  /** 客户端可见的公网主机（订阅/节点地址使用） */
  publicHost: String(pick(process.env.SSMANAGER_PUBLIC_HOST, fileConfig.publicHost, '127.0.0.1')),

  /** 订阅绝对 URL 的基础地址（可空；为空时后续使用请求的 host） */
  publicBaseUrl: String(
    pick(process.env.SSMANAGER_PUBLIC_BASE_URL, fileConfig.publicBaseUrl, '')
  ),

  /** 与 ssmanager 通信的超时（毫秒） */
  managerTimeoutMs: toTimeoutMs(
    pick(process.env.SSMANAGER_TIMEOUT_MS, fileConfig.managerTimeoutMs, 3000),
    3000
  ),
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
