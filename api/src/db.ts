/**
 * 统一 SQLite 连接与 schema 初始化/迁移。
 *
 * - 数据库文件：<dataDir>/ssmanager-web.db
 * - 启用外键（server_configs ← grants ← passwords 级联）
 * - 旧库通过 PRAGMA table_info 判断后 ALTER TABLE 加列
 *
 * 初始化失败会抛错，让进程启动失败，避免静默丢数据。
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DATA_DIR } from './config.js';

const DB_FILE = path.join(DATA_DIR, 'ssmanager-web.db');

function ensureColumn(database, table, column, ddl) {
  const columns = database.prepare('SELECT name FROM pragma_table_info(?)').all(table);
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}

let database;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  database = new DatabaseSync(DB_FILE);
  database.exec('PRAGMA foreign_keys = ON');

  database.exec(`
    CREATE TABLE IF NOT EXISTS server_configs (
      port INTEGER PRIMARY KEY,
      method TEXT,
      no_delay INTEGER,
      plugin TEXT,
      plugin_opts TEXT,
      plugin_mode TEXT,
      mode TEXT,
      password TEXT,
      template_code TEXT,
      template_format TEXT DEFAULT 'clash',
      template_updated_at INTEGER,
      updated_at INTEGER NOT NULL
    )
  `);

  // 旧库迁移：只加列，不迁移数据
  ensureColumn(database, 'server_configs', 'password', 'password TEXT');
  ensureColumn(database, 'server_configs', 'template_code', 'template_code TEXT');
  ensureColumn(
    database,
    'server_configs',
    'template_format',
    "template_format TEXT DEFAULT 'clash'"
  );
  ensureColumn(database, 'server_configs', 'template_updated_at', 'template_updated_at INTEGER');

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL COLLATE NOCASE UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_login_at INTEGER
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS registration_codes (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      used_at INTEGER,
      used_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_server_grants (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      port INTEGER NOT NULL REFERENCES server_configs(port) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, port)
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS user_server_passwords (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL,
      server_port INTEGER NOT NULL,
      slot INTEGER NOT NULL CHECK(slot IN (1, 2)),
      ss_name TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      subscription_token TEXT NOT NULL UNIQUE,
      age_private_key TEXT,
      age_public_key TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, server_port, slot),
      FOREIGN KEY(user_id, server_port) REFERENCES user_server_grants(user_id, port) ON DELETE CASCADE
    )
  `);

  // 旧库迁移：age 密钥列（不迁移旧数据）
  ensureColumn(database, 'user_server_passwords', 'age_private_key', 'age_private_key TEXT');
  ensureColumn(database, 'user_server_passwords', 'age_public_key', 'age_public_key TEXT');

  database.exec(`
    CREATE TABLE IF NOT EXISTS template_library (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      format TEXT NOT NULL DEFAULT 'clash',
      code TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
} catch (err) {
  console.error(`[db] 初始化 SQLite 失败 (${DB_FILE}): ${err.message}`);
  throw err;
}

export const db = database;
export const DB_FILE_PATH = DB_FILE;
