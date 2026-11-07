<script setup lang="ts">
import { computed } from 'vue'
import type { StatsResult } from '@/api'

/**
 * 后端统计对象的具体字段没有严格契约（supported: true 时返回统计对象），
 * 这里按「键 - 值」通用表格渲染，并对常见字段做中文映射与流量格式化。
 */
const props = defineProps<{ stats: StatsResult }>()

const STAT_LABELS: Record<string, string> = {
  uptime: '运行时长',
  start_time: '启动时间',
  startTime: '启动时间',
  rx: '接收流量',
  tx: '发送流量',
  total_rx: '累计接收流量',
  total_tx: '累计发送流量',
  connections: '当前连接数',
}

function isByteLikeKey(key: string): boolean {
  return /rx|tx|bytes|traffic/i.test(key)
}

function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 2)} ${units[unitIndex]}`
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') {
    if (isByteLikeKey(key)) return formatBytes(value)
    return Number.isInteger(value) ? value.toLocaleString('zh-CN') : value.toFixed(2)
  }
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

const rows = computed(() => {
  return Object.entries(props.stats)
    .filter(([key]) => key !== 'supported')
    .map(([key, value]) => ({
      key,
      label: STAT_LABELS[key] ?? key,
      value: formatValue(key, value),
    }))
})
</script>

<template>
  <el-card class="stats-card" shadow="never">
    <template #header>
      <span class="card-header-title">流量统计</span>
    </template>
    <el-table :data="rows" size="default">
      <el-table-column prop="label" label="指标" min-width="160" />
      <el-table-column prop="value" label="数值" min-width="200" />
    </el-table>
  </el-card>
</template>

<style scoped>
.card-header-title {
  font-size: 15px;
  font-weight: 600;
}
</style>
