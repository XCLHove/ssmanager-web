<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
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

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const container = ref<HTMLDivElement>()
let editor: monaco.editor.IStandaloneCodeEditor | null = null

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
