import type { AxiosRequestConfig } from 'axios'
import { post } from './http'
import { encryptPayloadWithPem } from '@/utils/crypto'
import type { Role } from '@/utils/auth'

export interface LoginResult {
  token: string
  username: string
  role: Role
  userId: number
}

/** 登录前获取的临时公钥（服务端会短时复用同一把公钥/kid） */
export interface LoginPublicKeyResult {
  publicKey: string
  kid: string
  expiresAt: number
}

export interface MeResult {
  userId: number
  username: string
  role: Role
}

export interface ServersResult {
  ports: number[]
  servers?: ServerInfo[]
}

export interface SimpleOk {
  ok: true
}

/** 服务器附加用户（多用户模式） */
export interface ServerUser {
  name: string
  password: string
  /** 后端补充的真实用户名（历史手工用户可能只有 name） */
  username?: string
}

/** 添加服务器请求体，除 port/password 外均可选 */
export interface AddServerPayload {
  port: number
  password: string
  method?: string
  noDelay?: boolean
  plugin?: string
  pluginOpts?: string
  pluginMode?: string
  mode?: string
  users?: ServerUser[]
}

/** 服务器详情（GET /api/servers 返回） */
export interface ServerInfo {
  port: number
  password: string
  /** true = 由本面板创建/编辑过，高级字段可回显；false = 外部创建 */
  configKnown?: boolean
  method?: string
  noDelay?: boolean
  plugin?: string
  pluginOpts?: string
  pluginMode?: string
  mode?: string
  users?: ServerUser[]
}

export interface StatusResult {
  ok: boolean
  address?: string
  error?: string
}

function fetchLoginPublicKey() {
  return post<LoginPublicKeyResult>('/auth/public-key', {}, { skipEncryption: true })
}

async function login(username: string, password: string, sessionKey: string) {
  // 每次登录都重新获取登录公钥，避免 kid/密钥过期
  const { publicKey, kid } = await fetchLoginPublicKey()
  const data = await encryptPayloadWithPem(publicKey, { username, password, sessionKey })
  // 登录传输本身不加密，但请求体中的业务数据已加密
  return post<LoginResult>('/auth/login', { kid, data }, { skipEncryption: true })
}

async function register(username: string, password: string, code: string) {
  const { publicKey, kid } = await fetchLoginPublicKey()
  const data = await encryptPayloadWithPem(publicKey, { username, password, code })
  return post<SimpleOk>('/auth/register', { kid, data }, { skipEncryption: true })
}

export const authApi = {
  fetchLoginPublicKey,
  /** password 为前端计算的 md5 小写 hex；sessionKey 为本次会话对称密钥 */
  login,
  /** password 为前端计算的 md5 小写 hex；code 为一次性注册码 */
  register,
  me: () => post<MeResult>('/auth/me'),
}

export const serversApi = {
  list: () => post<ServersResult>('/servers/list'),
  add: (payload: AddServerPayload) => post<SimpleOk>('/servers/add', payload),
  /** originalPort 为编辑前的端口，payload.port 可为修改后的新端口 */
  update: (originalPort: number, payload: AddServerPayload) =>
    post<SimpleOk>('/servers/update', { originalPort, ...payload }),
  remove: (port: number) => post<SimpleOk>('/servers/remove', { port }),
}

export const systemApi = {
  status: (config?: AxiosRequestConfig) => post<StatusResult>('/status', undefined, config),
}

/* ------------------------------ 管理员接口 ------------------------------ */

export type CodeStatus = 'unused' | 'used'

export interface RegistrationCodeItem {
  id: number
  code: string
  createdAt: number
  usedAt?: number | null
  usedByUsername?: string | null
}

export interface CodesListResult {
  items: RegistrationCodeItem[]
  unused: number
  used: number
}

export interface GenerateCodesResult {
  codes: string[]
}

export interface AdminUserItem {
  id: number
  username: string
  enabled: boolean
  createdAt: number
  lastLoginAt?: number | null
  grantCount: number
  passwordCount: number
}

export interface AdminUsersListResult {
  total: number
  items: AdminUserItem[]
}

export interface UserGrantsResult {
  ports: number[]
}

export interface RemoveUserResult {
  ok: true
  affectedPorts: number[]
}

/* ------------------------------ 用户接口 ------------------------------ */

export interface UserServerPassword {
  id: number
  slot: number
  url: string
  createdAt: number
  /** 明文兼容订阅 URL；旧密码为 null */
  plainUrl?: string | null
  /** age 私钥；旧密码为 null */
  agePrivateKey?: string | null
  agePublicKey?: string | null
}

export interface UserServerItem {
  port: number
  host: string
  method?: string
  configKnown?: boolean
  templateReady?: boolean
  canGenerate: boolean
  /** 密码槽数量，当前为 1；历史遗留数据可能包含更多密码 */
  maxSlots: number
  passwords: UserServerPassword[]
}

export interface UserServersListResult {
  items: UserServerItem[]
}

export interface GeneratedUserPassword {
  id: number
  slot: number
  password: string
  clientPassword: string
  url: string
  plainUrl: string
  agePrivateKey: string
  agePublicKey: string
}

/* ------------------------------ 流量统计接口 ------------------------------ */

export interface TrafficHistorySample {
  t: number
  rate: number
  total: number
  reset?: boolean
}

export interface TrafficHistoryLatest {
  t: number
  rate: number
  total: number
}

export interface TrafficHistoryResult {
  port: number
  window: number
  unit: string
  samples: TrafficHistorySample[]
  latest: TrafficHistoryLatest | null
}

/* ------------------------------ 模板接口 ------------------------------ */

export interface TemplateGetResult {
  format: string
  code: string
  defaultCode: string
  updatedAt?: number | null
}

export interface TemplatePreviewResult {
  yaml: string
}

export const adminApi = {
  servers: {
    reapply: (port: number) => post<SimpleOk>('/admin/servers/reapply', { port }),
  },
  statsHistory: (port: number, seconds: number, config?: AxiosRequestConfig) =>
    post<TrafficHistoryResult>('/admin/stats/history', { port, seconds }, config),
  templates: {
    get: (port: number) => post<TemplateGetResult>('/admin/templates/get', { port }),
    save: (port: number, format: string, code: string) =>
      post<SimpleOk>('/admin/templates/save', { port, format, code }),
    preview: (port: number, code: string) =>
      post<TemplatePreviewResult>('/admin/templates/preview', { port, code }),
  },
  codes: {
    generate: (count: number) => post<GenerateCodesResult>('/admin/codes/generate', { count }),
    list: (status?: CodeStatus) =>
      post<CodesListResult>('/admin/codes/list', status ? { status } : {}),
    remove: (id: number) => post<SimpleOk>('/admin/codes/remove', { id }),
  },
  users: {
    list: (keyword: string, page: number, pageSize: number) =>
      post<AdminUsersListResult>('/admin/users/list', { keyword, page, pageSize }),
    setEnabled: (userId: number, enabled: boolean) =>
      post<SimpleOk>('/admin/users/set-enabled', { userId, enabled }),
    resetPassword: (userId: number, password: string) =>
      post<SimpleOk>('/admin/users/reset-password', { userId, password }),
    getGrants: (userId: number) =>
      post<UserGrantsResult>('/admin/users/grants/get', { userId }),
    setGrants: (userId: number, ports: number[]) =>
      post<SimpleOk>('/admin/users/grants/set', { userId, ports }),
    remove: (userId: number) =>
      post<RemoveUserResult>('/admin/users/remove', { userId }),
  },
}

export const userApi = {
  servers: {
    list: () => post<UserServersListResult>('/user/servers/list'),
  },
  passwords: {
    generate: (port: number) =>
      post<GeneratedUserPassword>('/user/passwords/generate', { port }),
    remove: (id: number) => post<SimpleOk>('/user/passwords/remove', { id }),
  },
  /** oldPassword / newPassword 均为 md5 小写 hex */
  changePassword: (oldPassword: string, newPassword: string) =>
    post<SimpleOk>('/user/password/change', { oldPassword, newPassword }),
}
