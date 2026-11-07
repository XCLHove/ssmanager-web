/** 用户服务器密码（user_server_passwords）读写。 */

import { db } from '../db.js';

export function listPasswordsForPort(port) {
  return db
    .prepare('SELECT * FROM user_server_passwords WHERE server_port = ? ORDER BY slot')
    .all(Number(port));
}

export function listPasswordsForUserPort(userId, port) {
  return db
    .prepare('SELECT * FROM user_server_passwords WHERE user_id = ? AND server_port = ? ORDER BY slot')
    .all(Number(userId), Number(port));
}

export function countPasswordsForPort(port) {
  return db
    .prepare('SELECT COUNT(*) AS c FROM user_server_passwords WHERE server_port = ?')
    .get(Number(port)).c;
}

export function getPasswordById(id) {
  return db.prepare('SELECT * FROM user_server_passwords WHERE id = ?').get(Number(id)) ?? null;
}

export function insertPassword({ userId, serverPort, slot, ssName, password, subscriptionToken }) {
  const info = db
    .prepare(`
      INSERT INTO user_server_passwords
        (user_id, server_port, slot, ss_name, password, subscription_token, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    .run(Number(userId), Number(serverPort), Number(slot), ssName, password, subscriptionToken, Date.now());
  return Number(info.lastInsertRowid);
}

export function deletePassword(id) {
  db.prepare('DELETE FROM user_server_passwords WHERE id = ?').run(Number(id));
}

export function deletePasswordsForUserPort(userId, port) {
  db.prepare('DELETE FROM user_server_passwords WHERE user_id = ? AND server_port = ?').run(
    Number(userId),
    Number(port)
  );
}

/** 回滚用：按原 id 恢复一行（用于重建失败时还原刚删除的记录） */
export function restorePasswordRow(row) {
  db.prepare(`
    INSERT INTO user_server_passwords
      (id, user_id, server_port, slot, ss_name, password, subscription_token, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.user_id,
    row.server_port,
    row.slot,
    row.ss_name,
    row.password,
    row.subscription_token,
    row.created_at
  );
}

/** 订阅 token → 密码行 + 用户（JOIN 授权表确保授权仍存在） */
export function findSubscriptionByToken(token) {
  return (
    db
      .prepare(`
        SELECT p.*, u.username, u.enabled AS user_enabled
        FROM user_server_passwords p
        JOIN user_server_grants g ON g.user_id = p.user_id AND g.port = p.server_port
        JOIN users u ON u.id = p.user_id
        WHERE p.subscription_token = ?
      `)
      .get(String(token)) ?? null
  );
}
