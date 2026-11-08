<script setup lang="ts">
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
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
    <el-button type="primary" :icon="Plus" class="create-button" @click="openCreate">
      新建模板
    </el-button>

    <p class="list-tip">引用模板时会复制代码到服务器，之后模板库修改不影响已引用服务器</p>

    <el-card v-if="items.length === 0" class="empty-card" shadow="never">
      <el-empty description="暂无模板，点击「新建模板」创建" :image-size="90" />
    </el-card>

    <div v-else class="template-list">
      <el-card v-for="item in items" :key="item.id" class="template-card" shadow="never">
        <div class="card-head">
          <span class="template-name">{{ item.name }}</span>
          <el-tag size="small" effect="light">{{ item.format }}</el-tag>
        </div>

        <div class="meta-row">
          <span class="meta-label">创建时间</span>
          <span class="meta-value">{{ formatTime(item.createdAt) }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">更新时间</span>
          <span class="meta-value">{{ formatTime(item.updatedAt) }}</span>
        </div>

        <div class="card-actions">
          <el-button :icon="Edit" @click="openEdit(item)">编辑</el-button>
          <el-button type="danger" plain :icon="Delete" @click="handleRemove(item)">
            删除
          </el-button>
        </div>
      </el-card>
    </div>

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
  gap: 12px;
}

.create-button {
  width: 100%;
  min-height: 40px;
}

.list-tip {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.empty-card :deep(.el-card__body) {
  padding: 24px 12px;
}

.template-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.template-card :deep(.el-card__body) {
  padding: 14px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.template-name {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  word-break: break-all;
}

.meta-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 3px 0;
  font-size: 13px;
}

.meta-label {
  flex: none;
  color: var(--el-text-color-secondary);
}

.meta-value {
  min-width: 0;
  text-align: right;
  word-break: break-all;
  color: var(--el-text-color-primary);
}

.card-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.card-actions :deep(.el-button) {
  flex: 1;
  min-height: 40px;
  margin-left: 0;
}
</style>
