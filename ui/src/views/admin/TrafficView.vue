<script setup lang="ts">
import { defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import {
  adminApi,
  serversApi,
  type TrafficHistoryLatest,
  type TrafficHistorySample,
} from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const TrafficChart = defineAsyncComponent(() => import('@/components/TrafficChart.vue'))

const WINDOW_OPTIONS = [10, 20, 30, 60]

const ports = ref<number[]>([])
const portsLoaded = ref(false)
const selectedPort = ref<number | null>(null)
const windowSeconds = ref(30)
const samples = ref<TrafficHistorySample[]>([])
const latest = ref<TrafficHistoryLatest | null>(null)

let pollTimer: number | undefined
let requestSeq = 0

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
  startPolling()
})

onUnmounted(stopPolling)
</script>

<template>
  <div class="traffic-page">
    <el-card v-if="portsLoaded && ports.length === 0" shadow="never">
      <el-empty description="暂无服务器" />
    </el-card>

    <template v-else-if="ports.length > 0">
      <el-card shadow="never">
        <div class="filter-row">
          <span class="filter-label">端口</span>
          <el-select v-model="selectedPort" class="port-select" @change="handleFilterChange">
            <el-option v-for="port in ports" :key="port" :label="String(port)" :value="port" />
          </el-select>

          <span class="filter-label">时间窗口</span>
          <el-select v-model="windowSeconds" class="window-select" @change="handleFilterChange">
            <el-option
              v-for="seconds in WINDOW_OPTIONS"
              :key="seconds"
              :label="`${seconds} 秒`"
              :value="seconds"
            />
          </el-select>

          <el-button :icon="Refresh" @click="handleRefresh">刷新</el-button>
        </div>
      </el-card>

      <div class="metric-grid">
        <el-card shadow="never">
          <div class="metric-label">当前合计速率</div>
          <div class="metric-value">{{ latest ? formatRate(latest.rate) : '-' }}</div>
        </el-card>
        <el-card shadow="never">
          <div class="metric-label">累计总流量</div>
          <div class="metric-value">{{ latest ? formatBytes(latest.total) : '-' }}</div>
        </el-card>
        <el-card shadow="never">
          <div class="metric-label">采集时间</div>
          <div class="metric-value metric-time">{{ formatDateTime(latest?.t) }}</div>
        </el-card>
      </div>

      <el-card shadow="never">
        <template #header>
          <span class="card-header-title">合计速率</span>
        </template>
        <TrafficChart v-if="samples.length > 0" :samples="samples" />
        <el-empty v-else description="暂无流量样本" />
      </el-card>
    </template>
  </div>
</template>

<style scoped>
.traffic-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.filter-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.port-select {
  width: 150px;
}

.window-select {
  width: 120px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.metric-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.metric-value {
  font-size: 22px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.metric-time {
  font-size: 16px;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
