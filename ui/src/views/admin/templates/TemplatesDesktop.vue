<script setup lang="ts">
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import type { TemplateLibraryItem } from '@/api'
import { useTemplatesPage } from './useTemplatesPage'
import TemplateLibraryDialog from './TemplateLibraryDialog.vue'

const {
  items,
  dialogVisible,
  editingId,
  saving,
  form,
  formatTime,
  openCreate,
  openEdit,
  handleSave,
  handleRemove,
} = useTemplatesPage()
</script>

<template>
  <div class="templates-page">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <div class="list-title">
            <span class="card-header-title">模板库</span>
            <span class="list-tip">引用模板时会复制代码到服务器，之后模板库修改不影响已引用服务器</span>
          </div>
          <el-button type="primary" :icon="Plus" @click="openCreate">新建模板</el-button>
        </div>
      </template>

      <el-table :data="items" row-key="id" empty-text="暂无模板">
        <el-table-column prop="name" label="名称" min-width="220" />
        <el-table-column prop="format" label="格式" width="120" />
        <el-table-column label="创建时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="更新时间" min-width="180">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button
              size="small"
              :icon="Edit"
              @click="openEdit(row as TemplateLibraryItem)"
            >
              编辑
            </el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :icon="Delete"
              @click="handleRemove(row as TemplateLibraryItem)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <TemplateLibraryDialog
      v-model="dialogVisible"
      :editing-id="editingId"
      :form="form"
      :saving="saving"
      @save="handleSave"
    />
  </div>
</template>

<style scoped>
.templates-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header,
.list-title {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.card-header {
  justify-content: space-between;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.list-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
