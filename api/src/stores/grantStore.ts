/** 用户-服务器授权读写（P0-P2 范围）。 */

import { db } from '../db.js';

export function getGrantPorts(userId) {
  return db
    .prepare('SELECT port FROM user_server_grants WHERE user_id = ? ORDER BY port')
    .all(Number(userId))
    .map((row) => row.port);
}

/** 是否存在授权 */
export function hasGrant(userId, port) {
  return !!db
    .prepare('SELECT 1 AS found FROM user_server_grants WHERE user_id = ? AND port = ?')
    .get(Number(userId), Number(port));
}

/** 新增授权（已存在时忽略） */
export function addGrant(userId, port) {
  db.prepare(
    'INSERT OR IGNORE INTO user_server_grants (user_id, port, created_at) VALUES (?, ?, ?)'
  ).run(Number(userId), Number(port), Date.now());
}

/** 删除授权（调用方需先处理密码与服务器重建） */
export function removeGrant(userId, port) {
  db.prepare('DELETE FROM user_server_grants WHERE user_id = ? AND port = ?').run(
    Number(userId),
    Number(port)
  );
}

/** 服务器是否存在授权或已生成密码（用于禁止改端口） */
export function serverHasGrantsOrPasswords(port) {
  const portNum = Number(port);
  const grant = db
    .prepare('SELECT 1 AS found FROM user_server_grants WHERE port = ? LIMIT 1')
    .get(portNum);
  if (grant) return true;
  const password = db
    .prepare('SELECT 1 AS found FROM user_server_passwords WHERE server_port = ? LIMIT 1')
    .get(portNum);
  return !!password;
}
