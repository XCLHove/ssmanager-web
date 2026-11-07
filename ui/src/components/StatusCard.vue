<script setup lang="ts">
import { computed } from 'vue'
import { Refresh } from '@element-plus/icons-vue'

export type StatusState = 'checking' | 'ok' | 'error'

const props = defineProps<{
  status: StatusState
  address?: string
  error?: string
  updatedAt?: string
}>()

defineEmits<{ refresh: [] }>()

const tagType = computed(() => {
  if (props.status === 'ok') return 'success'
  if (props.status === 'error') return 'danger'
  return 'info'
})

const tagText = computed(() => {
  if (props.status === 'ok') return '连接正常'
  if (props.status === 'error') return '连接失败'
  return '检测中'
})

const detailText = computed(() => {
  if (props.status === 'ok') return `ssmanager 地址：${props.address || '未知'}`
  if (props.status === 'error') return props.error || '无法连接 ssmanager'
  return '正在检测 ssmanager 连接状态...'
})
</script>

<template>
  <el-card class="status-card" shadow="never">
    <div class="status-row">
      <div class="status-left">
        <span class="status-label">ssmanager 连接状态：</span>
        <el-tag :type="tagType" effect="dark" size="default" round>{{ tagText }}</el-tag>
        <span class="status-detail" :class="{ 'is-error': props.status === 'error' }">
          {{ detailText }}
        </span>
      </div>
      <div class="status-right">
        <span v-if="updatedAt" class="status-time">上次检测：{{ updatedAt }}</span>
        <el-button
          size="small"
          type="primary"
          plain
          :icon="Refresh"
          :loading="props.status === 'checking'"
          @click="$emit('refresh')"
        >
          刷新
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.status-card :deep(.el-card__body) {
  padding: 14px 18px;
}

.status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.status-label {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.status-detail {
  font-size: 13px;
  color: #606266;
}

.status-detail.is-error {
  color: #f56c6c;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.status-time {
  font-size: 12px;
  color: #909399;
}
</style>
