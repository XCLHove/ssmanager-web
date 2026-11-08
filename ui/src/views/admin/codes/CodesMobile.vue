<script setup lang="ts">
import { CopyDocument, Delete } from '@element-plus/icons-vue'
import { useCodesPage } from './useCodesPage'
import CodesFilterBar from './CodesFilterBar.vue'
import GenerateCodesPanel from './GenerateCodesPanel.vue'

const {
  items,
  unusedCount,
  usedCount,
  statusFilter,
  generateCount,
  generating,
  isUsed,
  formatTime,
  copyCode,
  loadCodes,
  handleStatusChange,
  handleGenerate,
  handleCopyAllUnused,
  handleRemove,
} = useCodesPage()
</script>

<template>
  <div class="codes-page">
    <GenerateCodesPanel
      v-model="generateCount"
      :generating="generating"
      @generate="handleGenerate"
      @copy-all="handleCopyAllUnused"
    />

    <el-card shadow="never">
      <CodesFilterBar
        v-model="statusFilter"
        :unused="unusedCount"
        :used="usedCount"
        @change="handleStatusChange"
        @refresh="loadCodes"
      />
    </el-card>

    <div class="code-list">
      <el-card v-for="item in items" :key="item.id" shadow="never" class="code-card">
        <div class="code-header">
          <span class="code-text">{{ item.code }}</span>
          <el-button size="small" :icon="CopyDocument" @click="copyCode(item.code)">
            复制
          </el-button>
        </div>

        <div class="meta-tags">
          <el-tag :type="isUsed(item) ? 'info' : 'success'" size="small" effect="light">
            {{ isUsed(item) ? '已使用' : '未使用' }}
          </el-tag>
        </div>

        <div class="meta-list">
          <div class="meta-item">
            <span class="meta-label">创建时间</span>
            <span class="meta-value">{{ formatTime(item.createdAt) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">使用时间</span>
            <span class="meta-value">{{ formatTime(item.usedAt) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">使用者</span>
            <span class="meta-value">
              {{ item.usedByUsername || (isUsed(item) ? '已删除用户' : '-') }}
            </span>
          </div>
        </div>

        <el-button
          class="delete-button"
          type="danger"
          plain
          :icon="Delete"
          :disabled="isUsed(item)"
          @click="handleRemove(item)"
        >
          删除
        </el-button>
      </el-card>

      <el-empty v-if="items.length === 0" description="暂无注册码" />
    </div>
  </div>
</template>

<style scoped>
.codes-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.code-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.code-card :deep(.el-card__body) {
  padding: 12px;
}

.code-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.code-text {
  min-width: 0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
  word-break: break-all;
}

.code-header :deep(.el-button) {
  flex-shrink: 0;
  margin-left: 0;
}

.meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  font-size: 13px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.meta-label {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.meta-value {
  min-width: 0;
  text-align: right;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.delete-button {
  width: 100%;
  margin: 12px 0 0;
}
</style>
