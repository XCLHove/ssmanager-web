<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import * as monaco from 'monaco-editor/editor/editor.api'
import 'monaco-editor/languages/definitions/javascript/register'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    language?: string
  }>(),
  { language: 'javascript' },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  save: []
}>()

const container = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null

/** 使用 Prettier（按需动态加载）格式化当前文档 */
async function formatDocument() {
  if (!editor) return
  const model = editor.getModel()
  if (!model) return

  const source = model.getValue()
  try {
    const [{ format }, babelPlugin, estreePlugin] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/babel'),
      import('prettier/plugins/estree'),
    ])
    // 模板代码是函数表达式（如 `function (ctx, h) {...}`），单独解析不是合法语句；
    // 用括号包裹成表达式后格式化，再去掉包裹与末尾分号。
    const formattedWrapped = await format(`(${source})`, {
      parser: 'babel',
      plugins: [babelPlugin, estreePlugin],
      semi: true,
      singleQuote: true,
      printWidth: 100,
      tabWidth: 2,
    })
    let formatted = formattedWrapped.trimEnd()
    if (formatted.endsWith(';')) formatted = formatted.slice(0, -1).trimEnd()
    if (formatted.startsWith('(') && formatted.endsWith(')')) {
      const inner = formatted.slice(1, -1).trim()
      if (/^(async\s+)?function\b/.test(inner)) formatted = inner
    }
    if (formatted === source) return

    const previousSelection = editor.getSelection()
    editor.pushUndoStop()
    editor.executeEdits('prettier', [
      { range: model.getFullModelRange(), text: formatted },
    ])
    editor.pushUndoStop()
    if (previousSelection) editor.setSelection(previousSelection)
  } catch (err) {
    ElMessage.error(`格式化失败：${err instanceof Error ? err.message : String(err)}`)
  }
}

onMounted(() => {
  if (!container.value) return

  editor = monaco.editor.create(container.value, {
    value: props.modelValue,
    language: props.language,
    theme: 'vs',
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    tabSize: 2,
    scrollBeyondLastLine: false,
    wordWrap: 'off',
  })

  editor.onDidChangeModelContent(() => {
    emit('update:modelValue', editor?.getValue() ?? '')
  })

  // Ctrl+S / Cmd+S：保存（拦截浏览器默认保存页面）
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    emit('save')
  })

  // Ctrl+Alt+L / Cmd+Alt+L：使用 Prettier 格式化
  editor.addCommand(
    monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyL,
    () => void formatDocument(),
  )
})

watch(
  () => props.modelValue,
  (value) => {
    if (editor && value !== editor.getValue()) {
      editor.setValue(value)
    }
  },
)

onBeforeUnmount(() => {
  editor?.dispose()
  editor = null
})
</script>

<template>
  <div ref="container" class="monaco-container"></div>
</template>

<style scoped>
.monaco-container {
  width: 100%;
  height: 100%;
  min-height: 400px;
}
</style>
