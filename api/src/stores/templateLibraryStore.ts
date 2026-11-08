/**
 * 模板库：可复用的 JS 配置模板。
 *
 * 服务器“引用”模板库时只是把代码复制到服务器自己的模板代码中，
 * 之后模板库修改不会影响已引用的服务器。
 */

import { db } from '../db.js';

export interface TemplateLibraryItem {
  id: number;
  name: string;
  format: string;
  code: string;
  createdAt: number;
  updatedAt: number;
}

function mapRow(row: Record<string, unknown>): TemplateLibraryItem {
  return {
    id: Number(row.id),
    name: String(row.name),
    format: String(row.format),
    code: String(row.code),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export function listTemplateLibrary(): Omit<TemplateLibraryItem, 'code'>[] {
  const rows = db
    .prepare(
      'SELECT id, name, format, created_at, updated_at FROM template_library ORDER BY updated_at DESC, id DESC'
    )
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    format: String(row.format),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  }));
}

export function getTemplateLibraryItem(id: number): TemplateLibraryItem | null {
  const row = db.prepare('SELECT * FROM template_library WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : null;
}

export function findTemplateLibraryByName(name: string): TemplateLibraryItem | null {
  const row = db.prepare('SELECT * FROM template_library WHERE name = ?').get(name) as
    | Record<string, unknown>
    | undefined;
  return row ? mapRow(row) : null;
}

export function createTemplateLibraryItem(
  name: string,
  format: string,
  code: string
): number {
  const now = Date.now();
  const result = db
    .prepare(
      'INSERT INTO template_library (name, format, code, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, format, code, now, now);
  return Number(result.lastInsertRowid);
}

export function updateTemplateLibraryItem(
  id: number,
  name: string,
  format: string,
  code: string
): boolean {
  const result = db
    .prepare(
      'UPDATE template_library SET name = ?, format = ?, code = ?, updated_at = ? WHERE id = ?'
    )
    .run(name, format, code, Date.now(), id);
  return result.changes > 0;
}

export function deleteTemplateLibraryItem(id: number): boolean {
  const result = db.prepare('DELETE FROM template_library WHERE id = ?').run(id);
  return result.changes > 0;
}
