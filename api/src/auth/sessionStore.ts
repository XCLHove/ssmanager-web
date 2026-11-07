/**
 * 内存会话存储：token → session，username → token。
 * 同一账号新登录会踢掉旧会话（单点登录）；会话含
 * { userId|null, username, role, requestKey, responseKey, expiresAt }。
 */

import crypto from 'node:crypto';
import { config } from '../config.js';
import type { Account } from '../types/models.js';

export interface Session extends Account {
  token: string;
  requestKey: Buffer;
  responseKey: Buffer;
  expiresAt: number;
}

function parseTtlMs(value: string): number {
  const match = /^(\d+)(ms|s|m|h|d)?$/i.exec(String(value).trim());
  if (!match) return 12 * 60 * 60 * 1000;
  const unit = (match[2] || 'ms').toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return Number(match[1]) * (multipliers[unit] ?? 1);
}

const SESSION_TTL_MS = parseTtlMs(config.jwtExpiresIn);

const SESSION_HKDF_SALT = Buffer.from('ssmanager-session-key', 'utf8');
const SESSION_REQUEST_INFO = Buffer.from('ssmanager/request', 'utf8');
const SESSION_RESPONSE_INFO = Buffer.from('ssmanager/response', 'utf8');

function deriveSessionKeys(sessionKey: Buffer): { requestKey: Buffer; responseKey: Buffer } {
  return {
    requestKey: Buffer.from(
      crypto.hkdfSync('sha256', sessionKey, SESSION_HKDF_SALT, SESSION_REQUEST_INFO, 32)
    ),
    responseKey: Buffer.from(
      crypto.hkdfSync('sha256', sessionKey, SESSION_HKDF_SALT, SESSION_RESPONSE_INFO, 32)
    ),
  };
}

const sessionsByToken = new Map<string, Session>();
/** lowercased username → token */
const tokenByUsername = new Map<string, string>();

function usernameKey(username: string): string {
  return String(username).toLowerCase();
}

/**
 * 创建新会话，并使同账号旧会话失效。
 * @param user 账号信息
 * @param sessionKey 32 字节协商密钥
 */
export function createSession(user: Account, sessionKey: Buffer): Session {
  revokeUserSessions(user.username);
  const { requestKey, responseKey } = deriveSessionKeys(sessionKey);

  const session: Session = {
    token: crypto.randomBytes(32).toString('hex'),
    userId: user.userId ?? null,
    username: user.username,
    role: user.role || 'user',
    requestKey,
    responseKey,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };

  sessionsByToken.set(session.token, session);
  tokenByUsername.set(usernameKey(session.username), session.token);
  return session;
}

export function getSession(token: string): Session | null {
  const session = sessionsByToken.get(token);
  if (!session) return null;
  if (Date.now() >= session.expiresAt) {
    removeSession(token);
    return null;
  }
  return session;
}

export function removeSession(token: string): void {
  const session = sessionsByToken.get(token);
  if (!session) return;
  sessionsByToken.delete(token);
  if (tokenByUsername.get(usernameKey(session.username)) === token) {
    tokenByUsername.delete(usernameKey(session.username));
  }
}

/** 踢掉某账号的当前会话（禁用/重置密码/新登录时使用） */
export function revokeUserSessions(username: string): void {
  const token = tokenByUsername.get(usernameKey(username));
  if (!token) return;
  tokenByUsername.delete(usernameKey(username));
  sessionsByToken.delete(token);
}
