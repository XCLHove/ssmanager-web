/**
 * 统一 API 响应信封。
 * 无论业务成功或失败，HTTP 状态码一律 200，业务状态放在 `code` 中。
 *   成功（明文，如 public-key / login）：{ code: 0, message: 'ok', data }
 *   成功（需鉴权接口）：{ code: 0, message: 'ok', data: { iv, data } }（AES-256-GCM）
 *   失败（始终明文）：{ code, message, data: null }
 */

import crypto from 'node:crypto';
import type { Response } from 'express';
import type { Session } from './auth/sessionStore.js';

export function ok(res: Response, data: any = null) {
  return res.status(200).json({ code: 0, message: 'ok', data });
}

/** 用会话 responseKey 加密成功响应 data（AES-256-GCM，12 字节随机 IV，末尾 16 字节 tag） */
export function okEncrypted(res: Response, session: Session, data: any) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', session.responseKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return res.status(200).json({
    code: 0,
    message: 'ok',
    data: {
      iv: iv.toString('base64'),
      data: Buffer.concat([encrypted, tag]).toString('base64'),
    },
  });
}

export function fail(res: Response, code: number, message: string) {
  return res.status(200).json({ code, message, data: null });
}
