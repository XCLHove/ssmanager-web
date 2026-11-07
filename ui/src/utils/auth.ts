/** token 在 localStorage 中的键名 */
const TOKEN_KEY = 'ssmanager_web_token'

/** 会话对称密钥（Base64 32 字节）键名，用于派生请求/响应 AES 密钥 */
const SESSION_KEY_KEY = 'ssmanager_web_session_key'

/** 当前用户角色键名 */
const ROLE_KEY = 'ssmanager_web_role'

export type Role = 'admin' | 'user'

/** 记住的登录凭据键名（仅保存在前端 localStorage） */
const REMEMBER_USERNAME_KEY = 'ssmanager_web_remember_username'
const REMEMBER_PASSWORD_KEY = 'ssmanager_web_remember_password'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export function getSessionKey(): string | null {
  return localStorage.getItem(SESSION_KEY_KEY)
}

export function setSessionKey(sessionKey: string): void {
  localStorage.setItem(SESSION_KEY_KEY, sessionKey)
}

export function clearSessionKey(): void {
  localStorage.removeItem(SESSION_KEY_KEY)
}

export function getRole(): Role | null {
  const role = localStorage.getItem(ROLE_KEY)
  return role === 'admin' || role === 'user' ? role : null
}

export function setRole(role: Role): void {
  localStorage.setItem(ROLE_KEY, role)
}

export function clearRole(): void {
  localStorage.removeItem(ROLE_KEY)
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
