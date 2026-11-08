<script setup lang="ts">
import { CopyDocument, Plus } from '@element-plus/icons-vue'

const count = defineModel<number>({ required: true })

defineProps<{
  generating: boolean
}>()

const emit = defineEmits<{
  (e: 'generate'): void
  (e: 'copy-all'): void
}>()
</script>

<template>
  <el-card shadow="never">
    <template #header>
      <span class="card-header-title">批量生成注册码</span>
    </template>
    <div class="generate-row">
      <span class="generate-label">生成数量</span>
      <el-input-number
        v-model="count"
        :min="1"
        :max="50"
        :precision="0"
        :controls="false"
        class="count-input"
      />
      <el-button type="primary" :icon="Plus" :disabled="generating" @click="emit('generate')">
        生成
      </el-button>
      <el-button :icon="CopyDocument" @click="emit('copy-all')">复制全部未使用</el-button>
      <span class="generate-tip">单次最多生成 50 个，格式为 XXXX-XXXX-XXXX</span>
    </div>
  </el-card>
</template>

<style scoped>
.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.generate-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.generate-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.count-input {
  width: 110px;
}

.generate-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

@media (max-width: 768px) {
  .generate-row {
    flex-direction: column;
    align-items: stretch;
  }

  .count-input {
    width: 100%;
  }

  .generate-row :deep(.el-button) {
    width: 100%;
    margin-left: 0;
  }
}
</style>
