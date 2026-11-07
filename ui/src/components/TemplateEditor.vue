<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{ port: number | null }>()

const code = ref('')
const defaultCode = ref('')
const format = ref('clash')
const previewYaml = ref('')

const title = computed(() => `配置模板 - 端口 ${props.port ?? '-'}`)

watch(visible, (open) => {
  if (open) void loadTemplate()
})

async function loadTemplate() {
  if (props.port === null) return

  code.value = ''
  defaultCode.value = ''
  previewYaml.value = ''

  const endLoading = globalLoadingStart('加载模板...')
  try {
    const res = await adminApi.templates.get(props.port)
    format.value = res.format || 'clash'
    code.value = res.code || res.defaultCode || ''
    defaultCode.value = res.defaultCode || ''
    if (code.value) {
      await handlePreview(false)
    }
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function handlePreview(showSuccess = true) {
  if (props.port === null) return

  const endLoading = globalLoadingStart('生成预览中...')
  try {
    const res = await adminApi.templates.preview(props.port, code.value)
    previewYaml.value = res.yaml
    if (showSuccess) {
      ElMessage.success('预览已更新')
    }
  } catch {
    previewYaml.value = ''
  } finally {
    endLoading()
  }
}

async function handleSave() {
  if (props.port === null) return

  const endLoading = globalLoadingStart('保存模板中...')
  try {
    await adminApi.templates.save(props.port, format.value || 'clash', code.value)
    ElMessage.success('模板已保存')
    visible.value = false
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function handleResetDefault() {
  code.value = defaultCode.value
  previewYaml.value = ''
}
</script>

<template>
  <el-dialog
    v-model="visible"
    class="template-dialog"
    :title="title"
    fullscreen
    destroy-on-close
  >
    <div class="template-body">
      <div class="editor-pane">
        <div class="pane-title">JavaScript 模板</div>
        <div class="editor-host">
          <MonacoEditor v-model="code" language="javascript" />
        </div>
      </div>
      <div class="preview-pane">
        <div class="pane-title">YAML 预览</div>
        <pre class="yaml-preview">{{ previewYaml || '点击「预览」生成 YAML' }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="template-footer">
        <el-button @click="handleResetDefault">恢复默认</el-button>
        <el-button @click="handlePreview()">预览</el-button>
        <el-button type="primary" @click="handleSave">保存</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.template-body {
  display: flex;
  gap: 16px;
  height: calc(100vh - 170px);
  min-height: 400px;
}

.editor-pane,
.preview-pane {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.pane-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.editor-host {
  flex: 1;
  min-height: 0;
}

.preview-pane {
  flex: 0.9;
}

.yaml-preview {
  flex: 1;
  margin: 0;
  padding: 12px;
  overflow: auto;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}

.template-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
