/** 用户表读写（P0-P2 范围）。 */

import { db } from '../db.js';

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(String(username)) ?? null;
}

export function findUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(Number(id)) ?? null;
}

/** 批量查询 userId → username，避免逐条查询 */
export function findUsernamesByIds(ids) {
  const unique = [...new Set(ids.map(Number).filter((id) => Number.isInteger(id)))];
  if (unique.length === 0) return new Map();

  const placeholders = unique.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, username FROM users WHERE id IN (${placeholders})`)
    .all(...unique);
  return new Map(rows.map((row) => [row.id, row.username]));
}

export function touchLastLogin(id) {
  const now = Date.now();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, Number(id));
}

/** @returns {boolean} 是否存在该用户 */
export function setUserEnabled(id, enabled) {
  const info = db
    .prepare('UPDATE users SET enabled = ?, updated_at = ? WHERE id = ?')
    .run(enabled ? 1 : 0, Date.now(), Number(id));
  return info.changes > 0;
}

/** @returns {boolean} 是否存在该用户 */
export function setUserPasswordHash(id, passwordHash) {
  const info = db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .run(passwordHash, Date.now(), Number(id));
  return info.changes > 0;
}

/** 修改用户登录密码（复用 setUserPasswordHash） */
export function updatePassword(id: number, passwordHash: string): boolean {
  return setUserPasswordHash(id, passwordHash);
}

/** 删除用户（授权/密码应已提前删除；注册码 used_by_user_id 由 FK SET NULL） */
export function deleteUser(id: number): boolean {
  const info = db.prepare('DELETE FROM users WHERE id = ?').run(Number(id));
  return info.changes > 0;
}

export function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
    grantCount: row.grant_count ?? 0,
    passwordCount: row.password_count ?? 0,
  };
}

export function listUsers({ keyword = '', page = 1, pageSize = 20 } = {}) {
  const trimmed = typeof keyword === 'string' ? keyword.trim() : '';
  const hasKeyword = trimmed !== '';
  const escaped = hasKeyword ? trimmed.replace(/[\\%_]/g, (char) => `\\${char}`) : '';
  const where = hasKeyword ? "WHERE u.username LIKE ? ESCAPE '\\'" : '';
  const params = hasKeyword ? [`%${escaped}%`] : [];

  const total = db
    .prepare(`SELECT COUNT(*) AS c FROM users u ${where}`)
    .get(...params).c;

  const offset = (page - 1) * pageSize;
  const rows = db
    .prepare(`
      SELECT u.id, u.username, u.enabled, u.created_at, u.last_login_at,
        (SELECT COUNT(*) FROM user_server_grants g WHERE g.user_id = u.id) AS grant_count,
        (SELECT COUNT(*) FROM user_server_passwords p WHERE p.user_id = u.id) AS password_count
      FROM users u
      ${where}
      ORDER BY u.id DESC
      LIMIT ? OFFSET ?
    `)
    .all(...params, pageSize, offset);

  return { total, items: rows.map(toPublicUser) };
}
