import axios, { type AxiosRequestConfig } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import { clearAuth, getSessionKey, getToken } from '@/utils/auth'
import {
  decryptResponse,
  encryptRequest,
  resetPublicKeyCache,
  type EncryptedSessionData,
} from '@/utils/crypto'

declare module 'axios' {
  export interface AxiosRequestConfig {
    /**
     * 静默请求：失败时不弹出统一的 ElMessage 错误提示（例如后台定时轮询），
     * 由调用方自行处理错误。登录态失效时仍会清除登录态并跳转登录页。
     */
    silent?: boolean
    /** 跳过请求体加密 / token 校验（登录公钥接口、登录接口使用） */
    skipEncryption?: boolean
  }
}

/** 后端统一响应信封：HTTP 均为 200，code === 0 表示成功 */
interface ApiEnvelope<T = unknown> {
  code: number
  message?: string
  data?: T
}

const instance = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

/** 判断成功响应 data 是否为会话加密结构 `{ iv, data }` */
function isEncryptedSessionData(value: unknown): value is EncryptedSessionData {
  if (typeof value !== 'object' || value === null) return false
  const data = value as Record<string, unknown>
  return typeof data.iv === 'string' && typeof data.data === 'string'
}

// 请求拦截器：附加 Bearer token，并用会话密钥加密业务请求体为 { data: { iv, data } }
instance.interceptors.request.use(async (config) => {
  // 登录公钥、登录接口：不要求 token、不加 Bearer、不加密
  if (config.skipEncryption) return config

  const token = getToken()
  const sessionKey = getSessionKey()

  // 无 token 或会话密钥时按未登录处理
  if (!token || !sessionKey) {
    clearAuth()
    resetPublicKeyCache()
    if (router.currentRoute.value.name !== 'login') {
      void router.push({ name: 'login' })
    }
    throw new Error('登录状态已失效，请重新登录')
  }

  config.headers.set('Authorization', `Bearer ${token}`)
  config.data = encryptRequest(config.data ?? {})
  return config
})

instance.interceptors.response.use(
  async (response) => {
    const body = response.data as ApiEnvelope<unknown>
    const silent = response.config.silent === true

    if (body?.code === 0) {
      // 登录/公钥接口为明文 data；业务接口为 { iv, data } 会话加密结构
      if (isEncryptedSessionData(body.data)) {
        try {
          response.data = decryptResponse(body.data)
        } catch (error) {
          if (!silent) {
            ElMessage.error(error instanceof Error ? error.message : '响应解密失败')
          }
          return Promise.reject(error)
        }
      } else {
        response.data = body.data
      }
      return response
    }

    const message = body?.message || '请求失败，请稍后重试'

    if (body?.code === 401) {
      clearAuth()
      resetPublicKeyCache()
      if (!silent) {
        ElMessage.error(message || '登录已过期，请重新登录')
      }
      void router.push({ name: 'login' })
    } else if (!silent) {
      ElMessage.error(message)
    }

    return Promise.reject(new Error(message))
  },
  (error) => {
    const silent = error?.config?.silent === true
    if (!silent) {
      ElMessage.error(error?.message || '网络请求失败，请稍后重试')
    }
    return Promise.reject(error)
  },
)

/**
 * 所有业务接口统一使用 POST，响应信封由拦截器解包，调用方直接拿到 data。
 */
export function post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return instance.post<T>(url, data, config).then((res) => res.data)
}
