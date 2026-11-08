<script setup lang="ts">
import { CopyDocument, Delete } from '@element-plus/icons-vue'
import type { RegistrationCodeItem } from '@/api'
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
      <template #header>
        <CodesFilterBar
          v-model="statusFilter"
          :unused="unusedCount"
          :used="usedCount"
          @change="handleStatusChange"
          @refresh="loadCodes"
        />
      </template>

      <el-table :data="items" row-key="id" empty-text="暂无注册码">
        <el-table-column label="注册码" min-width="200">
          <template #default="{ row }">
            <span class="code-text">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag
              :type="isUsed(row as RegistrationCodeItem) ? 'info' : 'success'"
              size="small"
              effect="light"
            >
              {{ isUsed(row as RegistrationCodeItem) ? '已使用' : '未使用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="使用时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.usedAt) }}</template>
        </el-table-column>
        <el-table-column label="使用者" min-width="140">
          <template #default="{ row }">
            {{
              row.usedByUsername ||
              (isUsed(row as RegistrationCodeItem) ? '已删除用户' : '-')
            }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button size="small" :icon="CopyDocument" @click="copyCode(row.code)">
              复制
            </el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :icon="Delete"
              :disabled="isUsed(row as RegistrationCodeItem)"
              @click="handleRemove(row as RegistrationCodeItem)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.codes-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.code-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
}
</style>
