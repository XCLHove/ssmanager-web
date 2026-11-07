/**
 * 认证门面：管理员凭据校验、登录公钥池、登录/注册限流；并 re-export 内存会话函数。
 *
 * - 配置管理员密码：前端提交 MD5 小写 hex，服务端对配置明文密码计算 MD5 后恒定时间比较。
 * - 普通用户密码哈希见 auth/password.js，登录流程见 routes/auth.js。
 * - 登录公钥池：RSA-2048，60s TTL，剩余 >10s 复用，池上限 8，登录/注册成功后销毁。
 * - 会话：见 auth/sessionStore.js（单点登录、HKDF 双向密钥）。
 */

import crypto from 'node:crypto';
import { config } from './config.js';

export { createSession, getSession, removeSession, revokeUserSessions } from './auth/sessionStore.js';

/** sha256 摘要：把任意长度输入归一化为 32 字节，保证 timingSafeEqual 输入等长且恒定时间 */
function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/** 恒定时间比较两个字符串（长度不等也走同样的路径） */
function timingSafeEqualString(a, b) {
  const da = digest(a);
  const db = digest(b);
  return crypto.timingSafeEqual(da, db);
}

function md5Hex(value) {
  return crypto.createHash('md5').update(String(value), 'utf8').digest('hex');
}

/** 校验配置管理员用户名与前端提交的 MD5 密码摘要 */
export function verifyCredentials(username, passwordMd5) {
  return (
    timingSafeEqualString(username, config.username) &&
    timingSafeEqualString(passwordMd5, md5Hex(config.password))
  );
}

/** 语义化别名 */
export const verifyAdminCredentials = verifyCredentials;

function generateRsaKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
}

/**
 * 登录公钥池：登录前先取一份短时 RSA 密钥对，客户端用该公钥加密凭据。
 * - 密钥对有效期 60 秒；
 * - 剩余有效期 > 10 秒时复用池中密钥，否则新建；
 * - 池上限 8，超限淘汰最旧项（过期项会先被清理）；
 * - 登录/注册成功后按 kid 一次性删除。
 */
const LOGIN_KEY_TTL_MS = 60_000;
const LOGIN_KEY_REUSE_MIN_MS = 10_000;
const LOGIN_KEY_POOL_MAX = 8;

/** @type {Map<string, { kid: string, publicKey: string, privateKey: string, expiresAt: number }>} */
const loginKeys = new Map();

function pruneLoginKeys(now) {
  for (const [kid, entry] of loginKeys) {
    if (entry.expiresAt <= now) {
      loginKeys.delete(kid);
    }
  }
}

/** 获取（必要时生成）登录公钥；返回体可直接给前端 */
export function getLoginPublicKey() {
  const now = Date.now();
  pruneLoginKeys(now);

  for (const entry of loginKeys.values()) {
    if (entry.expiresAt - now > LOGIN_KEY_REUSE_MIN_MS) {
      return { kid: entry.kid, publicKey: entry.publicKey, expiresAt: entry.expiresAt };
    }
  }

  while (loginKeys.size >= LOGIN_KEY_POOL_MAX) {
    loginKeys.delete(loginKeys.keys().next().value);
  }

  const { publicKey, privateKey } = generateRsaKeyPair();
  const entry = {
    kid: crypto.randomBytes(8).toString('hex'),
    publicKey,
    privateKey,
    expiresAt: now + LOGIN_KEY_TTL_MS,
  };
  loginKeys.set(entry.kid, entry);
  return { kid: entry.kid, publicKey: entry.publicKey, expiresAt: entry.expiresAt };
}

/** 按 kid 取登录密钥对（已过期/不存在返回 null），不删除 */
export function getLoginKey(kid) {
  pruneLoginKeys(Date.now());
  return loginKeys.get(kid) ?? null;
}

/** 登录/注册成功后销毁该登录密钥对（一次性） */
export function removeLoginKey(kid) {
  loginKeys.delete(kid);
}

/**
 * 登录限流：同一「用户名+来源 IP」在 10 分钟窗口内失败 5 次后封禁 5 分钟。
 */
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 5;
const BLOCK_MS = 5 * 60 * 1000;

/** @type {Map<string, { count: number, windowStart: number, blockedUntil: number }>} */
const failures = new Map();

function failureKey(username, ip) {
  return `${username}|${ip || 'unknown'}`;
}

export function isLoginBlocked(username, ip) {
  const entry = failures.get(failureKey(username, ip));
  if (!entry) return false;
  if (entry.blockedUntil > Date.now()) return true;
  return false;
}

export function recordLoginFailure(username, ip) {
  const key = failureKey(username, ip);
  const now = Date.now();
  let entry = failures.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    entry = { count: 0, windowStart: now, blockedUntil: 0 };
    failures.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.blockedUntil = now + BLOCK_MS;
    entry.count = 0;
    entry.windowStart = now;
  }
}

export function clearLoginFailures(username, ip) {
  failures.delete(failureKey(username, ip));
}

/** 登录失败时的固定延迟，进一步拖慢爆破 */
export function loginFailureDelay() {
  const ms = 400 + crypto.randomInt(0, 400);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 注册失败限流：按来源 IP 简单计数，10 分钟内失败 10 次封禁 5 分钟。
 */
const REGISTER_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_MAX_FAILURES = 10;
const REGISTER_BLOCK_MS = 5 * 60 * 1000;

/** @type {Map<string, { count: number, windowStart: number, blockedUntil: number }>} */
const registerFailures = new Map();

function registerKey(ip) {
  return ip || 'unknown';
}

export function isRegisterBlocked(ip) {
  const entry = registerFailures.get(registerKey(ip));
  return !!entry && entry.blockedUntil > Date.now();
}

export function recordRegisterFailure(ip) {
  const key = registerKey(ip);
  const now = Date.now();
  let entry = registerFailures.get(key);
  if (!entry || now - entry.windowStart > REGISTER_WINDOW_MS) {
    entry = { count: 0, windowStart: now, blockedUntil: 0 };
    registerFailures.set(key, entry);
  }
  entry.count += 1;
  if (entry.count >= REGISTER_MAX_FAILURES) {
    entry.blockedUntil = now + REGISTER_BLOCK_MS;
    entry.count = 0;
    entry.windowStart = now;
  }
}

export function clearRegisterFailures(ip) {
  registerFailures.delete(registerKey(ip));
}

/** 定期清理过期限流记录，避免 Map 无限增长 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) {
    if (entry.blockedUntil <= now && now - entry.windowStart > WINDOW_MS) {
      failures.delete(key);
    }
  }
  for (const [key, entry] of registerFailures) {
    if (entry.blockedUntil <= now && now - entry.windowStart > REGISTER_WINDOW_MS) {
      registerFailures.delete(key);
    }
  }
}, 60 * 1000).unref();
