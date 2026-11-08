import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { userApi, type UserServerItem, type UserServerPassword } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

export interface SlotEntry {
  slot: number
  password?: UserServerPassword
}

export function formatTime(value?: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

/** 每台服务器仅生成 1 个密码；历史遗留的多条密码仍全部列出 */
export function slotEntries(row: UserServerItem): SlotEntry[] {
  const passwords = [...(row.passwords ?? [])].sort((a, b) => a.slot - b.slot)

  if (passwords.length > 0) {
    return passwords.map((password) => ({ slot: password.slot, password }))
  }

  return [{ slot: 1 }]
}

export function isAgeEncrypted(password?: UserServerPassword): boolean {
  return !!password?.agePrivateKey
}

export function isTemplateReady(server: UserServerItem): boolean {
  return server.templateReady === true
}

export function encryptionLabel(password?: UserServerPassword): string {
  return isAgeEncrypted(password) ? 'age 加密' : '未加密'
}

export function useMyServersPage() {
  const servers = ref<UserServerItem[]>([])

  const subscribeVisible = ref(false)
  const subscribeUrl = ref('')
  const subscribePlainUrl = ref('')
  const subscribePassword = ref('')
  const subscribeAgePrivateKey = ref('')

  async function loadServers() {
    const endLoading = globalLoadingStart('加载服务器列表...')
    try {
      const res = await userApi.servers.list()
      servers.value = res.items
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  function openSubscribe(
    url: string,
    password?: string,
    agePrivateKey?: string | null,
    plainUrl?: string | null,
  ) {
    subscribeUrl.value = url
    subscribePlainUrl.value = plainUrl ?? ''
    subscribePassword.value = password ?? ''
    subscribeAgePrivateKey.value = agePrivateKey ?? ''
    subscribeVisible.value = true
  }

  async function handleGenerate(port: number) {
    const endLoading = globalLoadingStart('生成密码中...')
    try {
      const res = await userApi.passwords.generate(port)
      ElMessage.success('密码已生成')
      await loadServers()
      openSubscribe(res.url, res.password, res.agePrivateKey, res.plainUrl)
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  async function handleRemovePassword(password: UserServerPassword) {
    try {
      await ElMessageBox.confirm(
        '删除密码后对应订阅 URL 将立即失效，并可能导致该端口短暂断开。确定删除吗？',
        '删除密码',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }

    const endLoading = globalLoadingStart('删除密码中...')
    try {
      await userApi.passwords.remove(password.id)
      ElMessage.success('密码已删除')
      await loadServers()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  onMounted(() => {
    void loadServers()
  })

  return {
    servers,
    subscribeVisible,
    subscribeUrl,
    subscribePlainUrl,
    subscribePassword,
    subscribeAgePrivateKey,
    loadServers,
    openSubscribe,
    handleGenerate,
    handleRemovePassword,
  }
}
