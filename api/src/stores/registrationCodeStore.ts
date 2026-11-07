/** 注册码与注册事务（P0-P2 范围）。 */

import crypto from 'node:crypto';
import { db } from '../db.js';

/** 去掉易混字符 0/O/1/I/L */
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomSegment(length) {
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return result;
}

function makeCode() {
  return `${randomSegment(4)}-${randomSegment(4)}-${randomSegment(4)}`;
}

/** 批量生成唯一注册码，返回码列表 */
export function generateRegistrationCodes(count, createdBy) {
  const insert = db.prepare(
    'INSERT INTO registration_codes (code, created_by, created_at) VALUES (?, ?, ?)'
  );
  const codes: string[] = [];

  db.exec('BEGIN IMMEDIATE');
  try {
    while (codes.length < count) {
      const code = makeCode();
      try {
        insert.run(code, createdBy, Date.now());
        codes.push(code);
      } catch (err) {
        // 极低概率的 UNIQUE 冲突，重试即可
        if (!String(err.message).includes('UNIQUE')) throw err;
      }
    }
    db.exec('COMMIT');
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 忽略回滚异常
    }
    throw err;
  }

  return codes;
}

/** 注册码列表（可按 unused/used 过滤），同时返回两种状态计数 */
export function listRegistrationCodes(status) {
  const base = `
    SELECT rc.id, rc.code, rc.created_at, rc.used_at, u.username AS used_by_username
    FROM registration_codes rc
    LEFT JOIN users u ON u.id = rc.used_by_user_id
  `;

  let rows;
  if (status === 'unused') {
    rows = db.prepare(`${base} WHERE rc.used_at IS NULL ORDER BY rc.id DESC`).all();
  } else if (status === 'used') {
    rows = db.prepare(`${base} WHERE rc.used_at IS NOT NULL ORDER BY rc.id DESC`).all();
  } else {
    rows = db.prepare(`${base} ORDER BY rc.id DESC`).all();
  }

  const unused = db
    .prepare('SELECT COUNT(*) AS c FROM registration_codes WHERE used_at IS NULL')
    .get().c;
  const used = db
    .prepare('SELECT COUNT(*) AS c FROM registration_codes WHERE used_at IS NOT NULL')
    .get().c;

  return {
    items: rows.map((row) => ({
      id: row.id,
      code: row.code,
      createdAt: row.created_at,
      usedAt: row.used_at ?? null,
      usedByUsername: row.used_by_username ?? null,
    })),
    unused,
    used,
  };
}

/** 删除未使用的注册码 */
export function removeRegistrationCode(id) {
  const row = db
    .prepare('SELECT used_at FROM registration_codes WHERE id = ?')
    .get(Number(id));
  if (!row) return { error: '注册码不存在' };
  if (row.used_at !== null) return { error: '已使用的注册码不可删除' };

  db.prepare('DELETE FROM registration_codes WHERE id = ?').run(Number(id));
  return {};
}

/**
 * 事务内原子占码 + 创建用户。
 * @returns {{ userId: number } | { error: string }}
 */
export function createUserWithCode({ username, passwordHash, code }) {
  const now = Date.now();

  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      db.exec('ROLLBACK');
      return { error: '用户名已存在' };
    }

    const codeRow = db
      .prepare('SELECT id, used_at FROM registration_codes WHERE code = ?')
      .get(code);
    if (!codeRow || codeRow.used_at !== null) {
      db.exec('ROLLBACK');
      return { error: '注册码无效或已被使用' };
    }

    const info = db
      .prepare(`
        INSERT INTO users (username, password_hash, role, enabled, created_at, updated_at)
        VALUES (?, ?, 'user', 1, ?, ?)
      `)
      .run(username, passwordHash, now, now);
    const userId = Number(info.lastInsertRowid);

    const updated = db
      .prepare('UPDATE registration_codes SET used_at = ?, used_by_user_id = ? WHERE id = ? AND used_at IS NULL')
      .run(now, userId, codeRow.id);
    if (updated.changes === 0) {
      db.exec('ROLLBACK');
      return { error: '注册码无效或已被使用' };
    }

    db.exec('COMMIT');
    return { userId };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 忽略回滚异常
    }
    if (String(err.message).includes('UNIQUE')) {
      return { error: '用户名已存在' };
    }
    throw err;
  }
}
