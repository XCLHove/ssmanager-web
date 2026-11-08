import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { serversApi, systemApi, type ServerInfo } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

export type StatusState = 'checking' | 'ok' | 'error'

/** ssmanager 连接状态轮询间隔（30 秒） */
const STATUS_POLL_INTERVAL = 30_000

export function useServersPage() {
  const servers = ref<ServerInfo[]>([])
  const drawerVisible = ref(false)
  const editingServer = ref<ServerInfo | null>(null)
  const templateVisible = ref(false)
  const templatePort = ref<number | null>(null)
  const expandedPorts = ref<number[]>([])

  const status = ref<StatusState>('checking')
  const statusAddress = ref('')
  const statusError = ref('')
  const statusUpdatedAt = ref('')

  let statusTimer: number | undefined

  const tableRows = computed(() => [...servers.value].sort((a, b) => a.port - b.port))

  // el-table 的 expand-row-keys 类型为 string[]
  const expandedRowKeys = computed(() => expandedPorts.value.map(String))

  /** 桌面表格使用的状态文案（保持原有展示） */
  const serverStatusText = computed(() => {
    if (status.value === 'ok') return '运行中'
    if (status.value === 'checking') return '检测中'
    return '未知'
  })

  const serverStatusType = computed(() => (status.value === 'ok' ? 'success' : 'info'))

  /** 移动端卡片使用的运行状态标签 */
  const mobileStatusText = computed(() => {
    if (status.value === 'ok') return '运行'
    if (status.value === 'checking') return '检测中'
    return '未知'
  })

  const mobileStatusType = computed<'success' | 'info'>(() => {
    if (status.value === 'ok') return 'success'
    return 'info'
  })

  function userCount(server: ServerInfo): number {
    return server.users?.length ?? 0
  }

  async function loadStatus(showLoading = true) {
    const endLoading = showLoading ? globalLoadingStart('刷新状态中...') : () => {}
    status.value = 'checking'
    try {
      const res = await systemApi.status({ silent: true })
      if (res.ok) {
        status.value = 'ok'
        statusAddress.value = res.address ?? ''
        statusError.value = ''
      } else {
        status.value = 'error'
        statusAddress.value = ''
        statusError.value = res.error ?? 'ssmanager 连接失败'
      }
    } catch {
      status.value = 'error'
      statusAddress.value = ''
      statusError.value = '无法连接 ssmanager，请检查服务是否运行'
    } finally {
      statusUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
      endLoading()
    }
  }

  async function loadServers() {
    const endLoading = globalLoadingStart('加载服务器列表...')
    try {
      const res = await serversApi.list()
      servers.value = Array.isArray(res.servers)
        ? res.servers
        : (res.ports ?? []).map((port) => ({ port, password: '' }))

      // 列表刷新后清理已不存在端口的展开状态
      const validPorts = new Set(servers.value.map((server) => server.port))
      expandedPorts.value = expandedPorts.value.filter((port) => validPorts.has(port))
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  async function handleDelete(port: number) {
    try {
      await ElMessageBox.confirm(
        `确定要删除端口 ${port} 上的服务器吗？删除后该端口将停止监听。`,
        '删除确认',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return // 用户取消
    }

    const endLoading = globalLoadingStart('删除服务器中...')
    try {
      await serversApi.remove(port)
      ElMessage.success(`端口 ${port} 已删除`)
      await loadServers()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  function handleRowClick(row: ServerInfo) {
    const index = expandedPorts.value.indexOf(row.port)
    if (index >= 0) {
      expandedPorts.value.splice(index, 1)
    } else {
      expandedPorts.value.push(row.port)
    }
  }

  // 展开箭头等内部切换时同步受控的展开端口列表
  // Element Plus 普通表格的 expand-change 第二参为已展开行数组
  function handleExpandChange(row: ServerInfo, expanded: boolean | ServerInfo[]) {
    const isExpanded = Array.isArray(expanded)
      ? expanded.some((item) => item.port === row.port)
      : expanded
    const index = expandedPorts.value.indexOf(row.port)
    if (isExpanded && index < 0) {
      expandedPorts.value.push(row.port)
    } else if (!isExpanded && index >= 0) {
      expandedPorts.value.splice(index, 1)
    }
  }

  function openAdd() {
    editingServer.value = null
    drawerVisible.value = true
  }

  function openEdit(server: ServerInfo) {
    editingServer.value = server
    drawerVisible.value = true
  }

  function handleFormSuccess() {
    void loadServers()
  }

  function openTemplate(server: ServerInfo) {
    templatePort.value = server.port
    templateVisible.value = true
  }

  onMounted(() => {
    void loadStatus()
    void loadServers()
    // 定时轮询不显示全局 Loading
    statusTimer = window.setInterval(() => void loadStatus(false), STATUS_POLL_INTERVAL)
  })

  onUnmounted(() => {
    if (statusTimer !== undefined) {
      window.clearInterval(statusTimer)
      statusTimer = undefined
    }
  })

  return {
    servers,
    tableRows,
    status,
    statusAddress,
    statusError,
    statusUpdatedAt,
    serverStatusText,
    serverStatusType,
    mobileStatusText,
    mobileStatusType,
    userCount,
    drawerVisible,
    editingServer,
    templateVisible,
    templatePort,
    expandedPorts,
    expandedRowKeys,
    loadStatus,
    loadServers,
    handleDelete,
    handleRowClick,
    handleExpandChange,
    openAdd,
    openEdit,
    handleFormSuccess,
    openTemplate,
  }
}
