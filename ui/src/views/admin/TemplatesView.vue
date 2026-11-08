<script setup lang="ts">
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import { adminApi, type TemplateLibraryItem } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))

const items = ref<TemplateLibraryItem[]>([])
const dialogVisible = ref(false)
const editingId = ref<number | null>(null)
const saving = ref(false)
const form = ref({
  name: '',
  code: '',
  format: 'clash',
})

function formatTime(value?: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

async function loadList() {
  const endLoading = globalLoadingStart('加载模板库...')
  try {
    const res = await adminApi.templateLibrary.list()
    items.value = res.items
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function openCreate() {
  editingId.value = null
  form.value = { name: '', code: '', format: 'clash' }
  dialogVisible.value = true
}

async function openEdit(item: TemplateLibraryItem) {
  const endLoading = globalLoadingStart('加载模板...')
  try {
    const detail = await adminApi.templateLibrary.get(item.id)
    editingId.value = detail.id
    form.value = {
      name: detail.name,
      code: detail.code,
      format: detail.format || 'clash',
    }
    dialogVisible.value = true
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function handleSave() {
  if (saving.value) return
  const name = form.value.name.trim()
  if (!name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  if (!form.value.code.trim()) {
    ElMessage.warning('请输入模板代码')
    return
  }

  saving.value = true
  const endLoading = globalLoadingStart('保存模板中...')
  try {
    if (editingId.value === null) {
      await adminApi.templateLibrary.create(name, form.value.code, form.value.format)
      ElMessage.success('模板已创建')
    } else {
      await adminApi.templateLibrary.update(
        editingId.value,
        name,
        form.value.code,
        form.value.format,
      )
      ElMessage.success('模板已保存')
    }
    dialogVisible.value = false
    await loadList()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    saving.value = false
    endLoading()
  }
}

async function handleRemove(item: TemplateLibraryItem) {
  try {
    await ElMessageBox.confirm(
      `确定删除模板「${item.name}」吗？已复制到服务器的代码不会受影响。`,
      '删除模板',
      { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }

  const endLoading = globalLoadingStart('删除模板中...')
  try {
    await adminApi.templateLibrary.remove(item.id)
    ElMessage.success('模板已删除')
    await loadList()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

onMounted(() => {
  void loadList()
})
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

    <el-dialog
      v-model="dialogVisible"
      :title="editingId === null ? '新建模板' : '编辑模板'"
      width="960px"
      destroy-on-close
    >
      <el-form label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" maxlength="100" placeholder="模板名称" />
        </el-form-item>
        <el-form-item label="代码" required>
          <div class="editor-host">
            <MonacoEditor v-model="form.code" language="javascript" @save="handleSave" />
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :disabled="saving" @click="handleSave">保存</el-button>
      </template>
    </el-dialog>
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

.editor-host {
  width: 100%;
  height: 60vh;
  min-height: 380px;
}
</style>
