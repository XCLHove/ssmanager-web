import { onMounted, onUnmounted, ref } from 'vue'
import {
  adminApi,
  serversApi,
  type TrafficHistoryLatest,
  type TrafficHistorySample,
} from '@/api'
import { globalLoadingStart } from '@/utils/loading'

export const WINDOW_OPTIONS = [10, 20, 30, 60]

/** 流量统计页面的端口、窗口、采样、轮询与格式化逻辑 */
export function useTrafficPage() {
  const ports = ref<number[]>([])
  const portsLoaded = ref(false)
  const selectedPort = ref<number | null>(null)
  const windowSeconds = ref(30)
  const samples = ref<TrafficHistorySample[]>([])
  const latest = ref<TrafficHistoryLatest | null>(null)

  let pollTimer: number | undefined
  let requestSeq = 0
  let disposed = false

  function formatRate(value?: number | null): string {
    if (value === null || value === undefined) return '-'
    const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
    let rate = value
    let index = 0
    while (rate >= 1024 && index < units.length - 1) {
      rate /= 1024
      index += 1
    }
    return index === 0 ? `${Math.round(rate)} ${units[index]}` : `${rate.toFixed(2)} ${units[index]}`
  }

  function formatBytes(value?: number | null): string {
    if (value === null || value === undefined) return '-'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let bytes = value
    let index = 0
    while (bytes >= 1024 && index < units.length - 1) {
      bytes /= 1024
      index += 1
    }
    return index === 0 ? `${Math.round(bytes)} ${units[index]}` : `${bytes.toFixed(2)} ${units[index]}`
  }

  function formatDateTime(value?: number | null): string {
    return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
  }

  async function loadPorts() {
    const endLoading = globalLoadingStart('加载服务器列表...')
    try {
      const res = await serversApi.list()
      const list =
        Array.isArray(res.servers) && res.servers.length > 0
          ? res.servers.map((server) => server.port)
          : (res.ports ?? [])
      ports.value = [...new Set(list)].sort((a, b) => a - b)

      if (selectedPort.value === null || !ports.value.includes(selectedPort.value)) {
        selectedPort.value = ports.value[0] ?? null
      }
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      portsLoaded.value = true
      endLoading()
    }
  }

  async function loadHistory(showLoading = false) {
    const port = selectedPort.value
    if (port === null) {
      samples.value = []
      latest.value = null
      return
    }

    const seq = ++requestSeq
    const endLoading = showLoading ? globalLoadingStart('加载流量统计...') : undefined
    try {
      const res = await adminApi.statsHistory(port, windowSeconds.value, { silent: true })
      if (seq !== requestSeq) return
      samples.value = Array.isArray(res.samples) ? res.samples : []
      latest.value = res.latest ?? null
    } catch {
      // 失败保留上一次数据，静默处理
    } finally {
      endLoading?.()
    }
  }

  function handleFilterChange() {
    samples.value = []
    latest.value = null
    void loadHistory(false)
  }

  function handleRefresh() {
    void loadHistory(true)
  }

  function startPolling() {
    stopPolling()
    pollTimer = window.setInterval(() => void loadHistory(false), 1000)
  }

  function stopPolling() {
    if (pollTimer !== undefined) {
      window.clearInterval(pollTimer)
      pollTimer = undefined
    }
  }

  onMounted(async () => {
    await loadPorts()
    await loadHistory(true)
    if (disposed) return
    startPolling()
  })

  onUnmounted(() => {
    disposed = true
    stopPolling()
  })

  return {
    ports,
    portsLoaded,
    selectedPort,
    windowSeconds,
    samples,
    latest,
    WINDOW_OPTIONS,
    formatRate,
    formatBytes,
    formatDateTime,
    loadPorts,
    loadHistory,
    handleFilterChange,
    handleRefresh,
    startPolling,
    stopPolling,
  }
}
