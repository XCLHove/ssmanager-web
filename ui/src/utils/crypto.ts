import * as forge from 'node-forge'
import { getSessionKey } from '@/utils/auth'

/** RSA 登录加密结果 */
export interface EncryptedPayload {
  key: string
  iv: string
  data: string
}

/** 会话 AES-GCM 数据（请求体或响应体） */
export interface EncryptedSessionData {
  iv: string
  data: string
}

export interface EncryptedRequestBody {
  data: EncryptedSessionData
}

export interface DerivedSessionKeys {
  requestKey: string
  responseKey: string
}

/** 登录公钥解析结果按 PEM 缓存 */
const publicKeyCache = new Map<string, forge.pki.rsa.PublicKey>()

/** 会话密钥派生结果按 sessionKey 缓存 */
const sessionKeyCache = new Map<string, DerivedSessionKeys>()

const HKDF_SALT = forge.util.encodeUtf8('ssmanager-session-key')
const HKDF_REQUEST_INFO = forge.util.encodeUtf8('ssmanager/request')
const HKDF_RESPONSE_INFO = forge.util.encodeUtf8('ssmanager/response')

/** 登录成功 / 登录态失效时重置所有加密缓存 */
export function resetPublicKeyCache(): void {
  publicKeyCache.clear()
  sessionKeyCache.clear()
}

function getPublicKeyFromPem(pem: string): forge.pki.rsa.PublicKey {
  const cached = publicKeyCache.get(pem)
  if (cached) return cached

  const publicKey = forge.pki.publicKeyFromPem(pem)
  publicKeyCache.set(pem, publicKey)
  return publicKey
}

/** 生成会话对称密钥：Base64(32 随机字节) */
export function generateSessionKey(): string {
  return forge.util.encode64(forge.random.getBytesSync(32))
}

function hmacSha256(key: string, data: string): string {
  const hmac = forge.hmac.create()
  hmac.start('sha256', key)
  hmac.update(data)
  return hmac.digest().getBytes()
}

/** RFC 5869 HKDF-SHA256，输出 32 字节（一轮即可） */
function hkdfSha256(ikm: string, salt: string, info: string): string {
  const prk = hmacSha256(salt, ikm)
  return hmacSha256(prk, info + String.fromCharCode(0x01))
}

/** 由会话密钥派生请求/响应 AES-256-GCM 密钥（二进制字符串） */
export function deriveSessionKeys(sessionKeyB64: string): DerivedSessionKeys {
  const cached = sessionKeyCache.get(sessionKeyB64)
  if (cached) return cached

  const ikm = forge.util.decode64(sessionKeyB64)
  const keys: DerivedSessionKeys = {
    requestKey: hkdfSha256(ikm, HKDF_SALT, HKDF_REQUEST_INFO),
    responseKey: hkdfSha256(ikm, HKDF_SALT, HKDF_RESPONSE_INFO),
  }
  sessionKeyCache.set(sessionKeyB64, keys)
  return keys
}

/** AES-256-GCM 加密 JSON，返回标准 Base64 的 iv 与「密文 + 16B tag」 */
function aesGcmEncrypt(key: string, payload: unknown): EncryptedSessionData {
  const iv = forge.random.getBytesSync(12)
  const plaintext = forge.util.encodeUtf8(JSON.stringify(payload ?? {}))

  const cipher = forge.cipher.createCipher('AES-GCM', key)
  cipher.start({ iv })
  cipher.update(forge.util.createBuffer(plaintext))
  if (!cipher.finish()) {
    throw new Error('加密失败')
  }

  // 后端 Node crypto 约定 authTag 位于密文最后 16 字节
  const cipherBytes = cipher.output.getBytes() + cipher.mode.tag.getBytes()
  return {
    iv: forge.util.encode64(iv),
    data: forge.util.encode64(cipherBytes),
  }
}

/**
 * 用指定 PEM 公钥加密登录体：
 * 1. 随机 32 字节 AES-256 密钥 + 12 字节 IV 加密 JSON（UTF-8）；
 * 2. RSA-OAEP(SHA-256) + MGF1(SHA-256) 加密 AES 密钥；
 * 3. 密文末尾拼接 16 字节 GCM tag，全部输出标准 Base64。
 */
export async function encryptPayloadWithPem(
  pem: string,
  payload: unknown,
): Promise<EncryptedPayload> {
  const publicKey = getPublicKeyFromPem(pem)
  const key = forge.random.getBytesSync(32)
  const encrypted = aesGcmEncrypt(key, payload)

  const wrappedKey = publicKey.encrypt(key, 'RSA-OAEP', {
    md: forge.md.sha256.create(),
    mgf1: { md: forge.md.sha256.create() },
  })

  return {
    key: forge.util.encode64(wrappedKey),
    iv: encrypted.iv,
    data: encrypted.data,
  }
}

/** 使用 sessionStorage 中的会话密钥加密请求体 */
export function encryptRequest(payload: unknown): EncryptedRequestBody {
  try {
    const sessionKey = getSessionKey()
    if (!sessionKey) {
      throw new Error('缺少会话密钥，请重新登录')
    }
    const { requestKey } = deriveSessionKeys(sessionKey)
    return { data: aesGcmEncrypt(requestKey, payload) }
  } catch (error) {
    throw new Error(`请求加密失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}

/** 解密响应体：iv 与「密文 + 16B tag」均为 Base64 */
export function decryptResponse(encrypted: EncryptedSessionData): unknown {
  try {
    const sessionKey = getSessionKey()
    if (!sessionKey) {
      throw new Error('缺少会话密钥，请重新登录')
    }

    const { responseKey } = deriveSessionKeys(sessionKey)
    const iv = forge.util.decode64(encrypted.iv)
    const payload = forge.util.decode64(encrypted.data)
    if (payload.length < 16) {
      throw new Error('密文格式错误')
    }

    const tag = payload.slice(-16)
    const ciphertext = payload.slice(0, -16)
    const decipher = forge.cipher.createDecipher('AES-GCM', responseKey)
    decipher.start({ iv, tag: forge.util.createBuffer(tag) })
    decipher.update(forge.util.createBuffer(ciphertext))
    if (!decipher.finish()) {
      throw new Error('认证校验失败')
    }

    return JSON.parse(forge.util.decodeUtf8(decipher.output.getBytes()))
  } catch (error) {
    throw new Error(`响应解密失败：${error instanceof Error ? error.message : '未知错误'}`)
  }
}
