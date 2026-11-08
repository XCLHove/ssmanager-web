<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { useTrafficPage } from './traffic/useTrafficPage'

const TrafficChart = defineAsyncComponent(() => import('@/components/TrafficChart.vue'))

const {
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
  handleFilterChange,
  handleRefresh,
} = useTrafficPage()
</script>

<template>
  <div class="traffic-page">
    <el-card v-if="portsLoaded && ports.length === 0" shadow="never">
      <el-empty description="暂无服务器" />
    </el-card>

    <template v-else-if="ports.length > 0">
      <el-card shadow="never">
        <div class="filter-row">
          <div class="filter-item">
            <span class="filter-label">端口</span>
            <el-select v-model="selectedPort" class="port-select" @change="handleFilterChange">
              <el-option v-for="port in ports" :key="port" :label="String(port)" :value="port" />
            </el-select>
          </div>

          <div class="filter-item">
            <span class="filter-label">时间窗口</span>
            <el-select v-model="windowSeconds" class="window-select" @change="handleFilterChange">
              <el-option
                v-for="seconds in WINDOW_OPTIONS"
                :key="seconds"
                :label="`${seconds} 秒`"
                :value="seconds"
              />
            </el-select>
          </div>

          <el-button class="refresh-button" :icon="Refresh" @click="handleRefresh">刷新</el-button>
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

.filter-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-label {
  flex-shrink: 0;
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
  word-break: break-word;
}

.metric-time {
  font-size: 16px;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .traffic-page {
    gap: 12px;
  }

  .filter-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .filter-item {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
  }

  .port-select,
  .window-select {
    width: 100%;
  }

  .refresh-button {
    width: 100%;
    margin-left: 0;
  }

  .metric-grid {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .metric-value {
    font-size: 20px;
  }
}
</style>
