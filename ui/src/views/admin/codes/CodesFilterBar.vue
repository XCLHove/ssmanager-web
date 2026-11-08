<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import type { CodeStatus } from '@/api'

const status = defineModel<'' | CodeStatus>({ required: true })

defineProps<{
  unused: number
  used: number
}>()

const emit = defineEmits<{
  (e: 'change'): void
  (e: 'refresh'): void
}>()
</script>

<template>
  <div class="filter-bar">
    <div class="list-title">
      <span class="title">注册码列表</span>
      <el-tag type="success" size="small" effect="light">未使用 {{ unused }}</el-tag>
      <el-tag type="info" size="small" effect="light">已使用 {{ used }}</el-tag>
    </div>
    <div class="list-actions">
      <el-select v-model="status" class="status-select" @change="emit('change')">
        <el-option label="全部" value="" />
        <el-option label="未使用" value="unused" />
        <el-option label="已使用" value="used" />
      </el-select>
      <el-button :icon="Refresh" @click="emit('refresh')">刷新</el-button>
    </div>
  </div>
</template>

<style scoped>
.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.list-title,
.list-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.title {
  font-size: 15px;
  font-weight: 600;
}

.status-select {
  width: 130px;
}

@media (max-width: 768px) {
  .filter-bar,
  .list-title,
  .list-actions {
    flex-direction: column;
    align-items: stretch;
  }

  .list-title {
    align-items: flex-start;
  }

  .status-select {
    width: 100%;
  }

  .list-actions :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
}
</style>
