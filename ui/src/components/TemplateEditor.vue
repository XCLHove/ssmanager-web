<script setup lang="ts">
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, type TemplateLibraryItem } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const MonacoEditor = defineAsyncComponent(() => import('@/components/MonacoEditor.vue'))

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{ port: number | null }>()

const code = ref('')
const defaultCode = ref('')
const format = ref('clash')
const previewYaml = ref('')
const saving = ref(false)
const libraryItems = ref<TemplateLibraryItem[]>([])
const librarySelection = ref<number | null>(null)
const loadingLibrary = ref(false)

const title = computed(() => `配置模板 - 端口 ${props.port ?? '-'}`)

watch(visible, (open) => {
  if (open) {
    void loadTemplate()
    void loadLibrary()
  }
})

async function loadLibrary() {
  loadingLibrary.value = true
  try {
    const res = await adminApi.templateLibrary.list()
    libraryItems.value = res.items
  } catch {
    libraryItems.value = []
  } finally {
    loadingLibrary.value = false
  }
}

/** 从模板库载入：直接替换当前编辑器中的服务器模板代码 */
async function handleLoadLibrary() {
  const id = librarySelection.value
  if (id === null) return
  const item = libraryItems.value.find((t) => t.id === id)
  if (!item) return

  const endLoading = globalLoadingStart('载入模板...')
  try {
    const detail = await adminApi.templateLibrary.get(id)
    if (code.value.trim() && code.value !== detail.code) {
      try {
        await ElMessageBox.confirm(
          `载入模板「${detail.name}」将替换当前编辑器中的模板代码，是否继续？`,
          '载入模板',
          { confirmButtonText: '替换', cancelButtonText: '取消', type: 'warning' },
        )
      } catch {
        return
      }
    }

    code.value = detail.code
    ElMessage.success(`已载入模板「${detail.name}」，保存后生效`)
    await handlePreview(false)
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function loadTemplate() {
  if (props.port === null) return

  code.value = ''
  defaultCode.value = ''
  previewYaml.value = ''
  librarySelection.value = null

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
  if (props.port === null || saving.value) return

  saving.value = true
  const endLoading = globalLoadingStart('保存模板中...')
  try {
    await adminApi.templates.save(props.port, format.value || 'clash', code.value)
    ElMessage.success('模板已保存')
    // 保存成功后同步刷新预览；保存本身不关闭弹窗
    await handlePreview(false)
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    saving.value = false
    endLoading()
  }
}

/** 将当前编辑器代码另存为模板库条目 */
async function handleSaveAsTemplate() {
  if (!code.value.trim()) {
    ElMessage.warning('模板代码不能为空')
    return
  }

  let name: string
  try {
    const result = await ElMessageBox.prompt('请输入模板名称', '存为模板', {
      confirmButtonText: '保存',
      cancelButtonText: '取消',
      inputValue: props.port === null ? '服务器模板' : `端口 ${props.port} 模板`,
      inputPlaceholder: '模板名称',
      inputValidator: (value: string) =>
        value && value.trim() ? true : '请输入模板名称',
    })
    name = result.value.trim()
  } catch {
    return
  }

  const endLoading = globalLoadingStart('保存模板中...')
  try {
    const res = await adminApi.templateLibrary.create(name, code.value)
    ElMessage.success(`已存为模板「${name}」`)
    await loadLibrary()
    librarySelection.value = res.id
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
        <div class="pane-title">
          <span>JavaScript 模板</span>
          <div class="library-actions">
            <el-select
              v-model="librarySelection"
              size="small"
              placeholder="从模板库载入"
              clearable
              :loading="loadingLibrary"
              class="library-select"
            >
              <el-option
                v-for="item in libraryItems"
                :key="item.id"
                :label="item.name"
                :value="item.id"
              />
            </el-select>
            <el-button
              size="small"
              :disabled="librarySelection === null"
              @click="handleLoadLibrary"
            >
              载入并替换
            </el-button>
          </div>
        </div>
        <div class="editor-host">
          <MonacoEditor v-model="code" language="javascript" @save="handleSave" />
        </div>
      </div>
      <div class="preview-pane">
        <div class="pane-title">YAML 预览</div>
        <pre class="yaml-preview">{{ previewYaml || '点击「预览」生成 YAML' }}</pre>
      </div>
    </div>

    <template #footer>
      <div class="template-footer">
        <span class="shortcut-hint">Ctrl+Alt+L 格式化 · Ctrl+S 保存</span>
        <el-button @click="handleSaveAsTemplate">存为模板</el-button>
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.library-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.library-select {
  width: 220px;
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
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.shortcut-hint {
  margin-right: auto;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
