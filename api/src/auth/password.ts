/**
 * 普通用户密码哈希：scrypt(md5hex, 16B salt, 64, {N:16384, r:8, p:1})。
 * 存储格式：scrypt$N$r$p$saltB64$hashB64
 * 配置中的管理员密码仍走 md5 比较（见 authService.verifyAdminCredentials）。
 */

import crypto from 'node:crypto';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

export function hashPassword(passwordMd5) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.scryptSync(String(passwordMd5), salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export function verifyPassword(passwordMd5, stored) {
  if (typeof stored !== 'string') return false;

  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![N, r, p].every(Number.isInteger)) return false;

  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const actual = crypto.scryptSync(String(passwordMd5), salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
