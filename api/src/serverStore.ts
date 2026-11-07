/**
 * 本地服务器配置存储（SQLite，统一连接见 db.js）。
 *
 * 记录 method/noDelay/plugin/pluginOpts/pluginMode/mode 以及服务器主密码 password，
 * 供列表合并展示与后续模板/重建使用。
 *
 * saveServerConfig 使用 UPSERT（INSERT ... ON CONFLICT DO UPDATE），
 * 绝不 DELETE+INSERT，避免误触发外键级联删除授权/密码。
 */

import { db } from './db.js';
import type { ServerOptions, ServerRecord } from './types/models.js';

/** 需要本地记录的高级字段 */
const ADVANCED_FIELDS = ['method', 'noDelay', 'plugin', 'pluginOpts', 'pluginMode', 'mode'] as const;

const selectAllStmt = db.prepare('SELECT * FROM server_configs');
const selectOneStmt = db.prepare('SELECT * FROM server_configs WHERE port = ?');
const deleteStmt = db.prepare('DELETE FROM server_configs WHERE port = ?');
const upsertStmt = db.prepare(`
  INSERT INTO server_configs (
    port, method, no_delay, plugin, plugin_opts, plugin_mode, mode, password, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(port) DO UPDATE SET
    method = excluded.method,
    no_delay = excluded.no_delay,
    plugin = excluded.plugin,
    plugin_opts = excluded.plugin_opts,
    plugin_mode = excluded.plugin_mode,
    mode = excluded.mode,
    password = COALESCE(excluded.password, server_configs.password),
    updated_at = excluded.updated_at
`);

function pickAdvanced(options: ServerOptions): ServerOptions {
  const record: any = {};
  for (const field of ADVANCED_FIELDS) {
    if (options[field] !== undefined) {
      record[field] = options[field];
    }
  }
  return record;
}

/** SQLite 行 → camelCase 对象；未设置的字段不输出 */
function rowToConfig(row: any): ServerOptions & { port: number } {
  const result: any = { port: Number(row.port) };
  if (row.method != null) result.method = row.method;
  if (row.no_delay != null) result.noDelay = row.no_delay !== 0;
  if (row.plugin != null) result.plugin = row.plugin;
  if (row.plugin_opts != null) result.pluginOpts = row.plugin_opts;
  if (row.plugin_mode != null) result.pluginMode = row.plugin_mode;
  if (row.mode != null) result.mode = row.mode;
  return result;
}

function boolToDb(value: any): number | null {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

/** 读取全部记录（key 为端口字符串） */
export function getAllServerConfigs(): Record<string, ServerOptions & { port: number }> {
  const configs: Record<string, ServerOptions & { port: number }> = {};
  for (const row of selectAllStmt.all()) {
    configs[String(row.port)] = rowToConfig(row);
  }
  return configs;
}

/** 读取单个端口的高级字段记录，不存在返回 null */
export function getServerConfig(port: number): (ServerOptions & { port: number }) | null {
  const row = selectOneStmt.get(Number(port));
  return row ? rowToConfig(row) : null;
}

/** 读取完整记录（含主密码与模板字段），供 P3/P4 内部使用 */
export function getServerRecord(port: number): ServerRecord | null {
  const row: any = selectOneStmt.get(Number(port));
  if (!row) return null;
  return {
    ...rowToConfig(row),
    password: row.password ?? null,
    templateCode: row.template_code ?? null,
    templateFormat: row.template_format ?? 'clash',
    templateUpdatedAt: row.template_updated_at ?? null,
  };
}

/** 保存自定义模板；返回该端口是否存在 */
export function saveServerTemplate(port: number, format: string, code: string): boolean {
  const info = db
    .prepare(
      'UPDATE server_configs SET template_code = ?, template_format = ?, template_updated_at = ? WHERE port = ?'
    )
    .run(code, format, Date.now(), Number(port));
  return info.changes > 0;
}

/**
 * 覆盖写入该端口的高级字段（UPSERT，未提交字段写 null；password 未提供时保留旧值）。
 * extra 可携带 { password }（服务器主 PSK）。
 */
export function saveServerConfig(
  port: number,
  options: ServerOptions,
  extra: { password?: string } = {}
): void {
  const fields = pickAdvanced(options);
  const portNum = Number(port);
  const password = typeof extra.password === 'string' ? extra.password : null;

  try {
    upsertStmt.run(
      portNum,
      fields.method ?? null,
      boolToDb(fields.noDelay),
      fields.plugin ?? null,
      fields.pluginOpts ?? null,
      fields.pluginMode ?? null,
      fields.mode ?? null,
      password,
      Date.now()
    );
  } catch (err) {
    console.error('[serverStore] 保存本地记录失败:', err.message);
  }
}

/** 删除该端口的记录（外键会级联清理授权/密码） */
export function removeServerConfig(port: number): void {
  try {
    deleteStmt.run(Number(port));
  } catch (err) {
    console.error('[serverStore] 删除本地记录失败:', err.message);
  }
}

/** 清理已不在 ssmanager 运行列表中的端口记录；列表为空时清空表 */
export function pruneServerConfigs(ports: number[]): void {
  try {
    const alive = ports.map(Number).filter((port) => Number.isInteger(port));
    if (alive.length === 0) {
      db.exec('DELETE FROM server_configs');
      return;
    }
    const placeholders = alive.map(() => '?').join(', ');
    db.prepare(`DELETE FROM server_configs WHERE port NOT IN (${placeholders})`).run(...alive);
  } catch (err) {
    console.error('[serverStore] 清理本地记录失败:', err.message);
  }
}
