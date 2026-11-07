/**
 * 请求体解密。
 *
 * - 登录（非对称）：RSA-OAEP(SHA-256) 解出 32 字节 AES key，再用 AES-256-GCM 解密。
 * - 其余接口（对称）：直接用会话 requestKey 做 AES-256-GCM 解密。
 *
 * 信封格式：
 *   登录     { key: <base64>, iv: <base64>, data: <base64> }
 *   普通请求 { iv: <base64>, data: <base64> }
 * iv 为 12 字节；data 为密文 + 末尾 16 字节 GCM tag。
 * 解密成功后返回 JSON.parse 结果；空明文返回 {}；任何错误抛异常。
 */

import crypto from 'node:crypto';

function decryptAesGcm(aesKey, iv, data) {
  if (typeof iv !== 'string' || typeof data !== 'string') {
    throw new Error('invalid envelope fields');
  }

  const ivBuffer = Buffer.from(iv, 'base64');
  if (ivBuffer.length !== 12) {
    throw new Error('invalid iv length');
  }

  const cipherBuffer = Buffer.from(data, 'base64');
  if (cipherBuffer.length < 16) {
    throw new Error('ciphertext too short');
  }

  const tag = cipherBuffer.subarray(cipherBuffer.length - 16);
  const encrypted = cipherBuffer.subarray(0, cipherBuffer.length - 16);

  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, ivBuffer);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  return plaintext.trim() === '' ? {} : JSON.parse(plaintext);
}

/** 登录解密：RSA-OAEP(SHA-256) + AES-256-GCM */
export function decryptEnvelope(privateKey, envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('missing data envelope');
  }

  const { key } = envelope;
  if (typeof key !== 'string') {
    throw new Error('invalid envelope fields');
  }

  const aesKey = crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    Buffer.from(key, 'base64')
  );
  if (aesKey.length !== 32) {
    throw new Error('invalid AES key length');
  }

  return decryptAesGcm(aesKey, envelope.iv, envelope.data);
}

/** 普通请求解密：使用会话 requestKey 做 AES-256-GCM */
export function decryptSymmetric(aesKey, envelope) {
  if (!envelope || typeof envelope !== 'object') {
    throw new Error('missing data envelope');
  }
  return decryptAesGcm(aesKey, envelope.iv, envelope.data);
}
