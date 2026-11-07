import { reactive } from 'vue'
import { authApi } from '@/api'
import { getRole, getSessionKey, getToken, setRole, type Role } from '@/utils/auth'

export interface SessionUser {
  userId: number
  username: string
  role: Role
}

const emptyUser = (): SessionUser => ({
  userId: 0,
  username: '',
  role: getRole() ?? 'user',
})

/** 当前登录用户的响应式缓存 */
export const session = reactive<SessionUser>(emptyUser())

let cachedToken: string | null = null
let mePromise: Promise<SessionUser | null> | null = null

export function setSessionUser(user: SessionUser): void {
  session.userId = user.userId
  session.username = user.username
  session.role = user.role
  cachedToken = getToken()
}

export function clearSessionUser(): void {
  Object.assign(session, emptyUser())
  cachedToken = null
  mePromise = null
}

/**
 * 确保当前用户信息已加载；token 变化后自动失效重取。
 * 无 token / 会话密钥或请求失败时返回 null。
 */
export async function ensureMe(force = false): Promise<SessionUser | null> {
  const token = getToken()
  if (!token || !getSessionKey()) return null

  if (!force && cachedToken === token && session.userId > 0) {
    return { ...session }
  }

  if (!mePromise) {
    mePromise = authApi
      .me()
      .then((me) => {
        const user: SessionUser = {
          userId: me.userId,
          username: me.username,
          role: me.role,
        }
        setSessionUser(user)
        setRole(me.role)
        return user
      })
      .catch(() => null)
      .finally(() => {
        mePromise = null
      })
  }

  return mePromise
}
