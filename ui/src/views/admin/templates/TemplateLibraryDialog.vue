<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { useIsMobile } from '@/composables/useIsMobile'
import type { TemplateLibraryForm } from './useTemplatesPage'

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  editingId: number | null
  form: TemplateLibraryForm
  saving: boolean
}>()

const emit = defineEmits<{ save: [] }>()

const isMobile = useIsMobile()

const title = computed(() => (props.editingId === null ? '新建模板' : '编辑模板'))

function handleSave() {
  emit('save')
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="template-library-dialog"
    :title="title"
    :width="isMobile ? '100%' : '960px'"
    :fullscreen="isMobile"
    destroy-on-close
  >
    <el-form
      :label-position="isMobile ? 'top' : 'right'"
      :label-width="isMobile ? 'auto' : '80px'"
    >
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
      <div class="dialog-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="saving" @click="handleSave">保存</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.editor-host {
  width: 100%;
  height: 60vh;
  min-height: 380px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 768px) {
  .editor-host {
    height: 50vh;
    min-height: 240px;
  }

  .editor-host :deep(.monaco-container) {
    min-height: 0;
  }

  .dialog-footer :deep(.el-button) {
    flex: 1;
    margin-left: 0;
  }
}
</style>
