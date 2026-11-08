/** 登录态（token / 会话密钥 / 角色）保存在 sessionStorage：关闭标签页即失效 */
const AUTH_STORAGE = sessionStorage

/** token 在 sessionStorage 中的键名 */
const TOKEN_KEY = 'ssmanager_web_token'

/** 会话对称密钥（Base64 32 字节）键名，用于派生请求/响应 AES 密钥 */
const SESSION_KEY_KEY = 'ssmanager_web_session_key'

/** 当前用户角色键名 */
const ROLE_KEY = 'ssmanager_web_role'

export type Role = 'admin' | 'user'

/** 记住的登录凭据键名（仅保存在前端 localStorage） */
const REMEMBER_USERNAME_KEY = 'ssmanager_web_remember_username'
const REMEMBER_PASSWORD_KEY = 'ssmanager_web_remember_password'

// 清理旧版本遗留在 localStorage 的登录态，避免陈旧凭据残留
for (const key of [TOKEN_KEY, SESSION_KEY_KEY, ROLE_KEY]) {
  localStorage.removeItem(key)
}

export function getToken(): string | null {
  return AUTH_STORAGE.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  AUTH_STORAGE.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  AUTH_STORAGE.removeItem(TOKEN_KEY)
}

export function getSessionKey(): string | null {
  return AUTH_STORAGE.getItem(SESSION_KEY_KEY)
}

export function setSessionKey(sessionKey: string): void {
  AUTH_STORAGE.setItem(SESSION_KEY_KEY, sessionKey)
}

export function clearSessionKey(): void {
  AUTH_STORAGE.removeItem(SESSION_KEY_KEY)
}

export function getRole(): Role | null {
  const role = AUTH_STORAGE.getItem(ROLE_KEY)
  return role === 'admin' || role === 'user' ? role : null
}

export function setRole(role: Role): void {
  AUTH_STORAGE.setItem(ROLE_KEY, role)
}

export function clearRole(): void {
  AUTH_STORAGE.removeItem(ROLE_KEY)
}

/** 清除登录态（token + 会话密钥 + 角色），不影响记住的账户/密码 */
export function clearAuth(): void {
  clearToken()
  clearSessionKey()
  clearRole()
}

export interface RememberedCredentials {
  username: string
  password: string
}

export function getRememberedCredentials(): RememberedCredentials {
  return {
    username: localStorage.getItem(REMEMBER_USERNAME_KEY) ?? '',
    password: localStorage.getItem(REMEMBER_PASSWORD_KEY) ?? '',
  }
}

export function saveRememberedCredentials(
  username: string,
  password: string,
  rememberUsername: boolean,
  rememberPassword: boolean,
): void {
  if (rememberUsername) {
    localStorage.setItem(REMEMBER_USERNAME_KEY, username)
  } else {
    localStorage.removeItem(REMEMBER_USERNAME_KEY)
  }

  if (rememberPassword) {
    localStorage.setItem(REMEMBER_PASSWORD_KEY, password)
  } else {
    localStorage.removeItem(REMEMBER_PASSWORD_KEY)
  }
}
