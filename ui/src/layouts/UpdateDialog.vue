<script setup lang="ts">
import { computed } from 'vue'
import type { VersionInfo } from '@/api'

const props = defineProps<{
  modelValue: boolean
  versionInfo: VersionInfo | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const latestTagText = computed(() =>
  props.versionInfo?.latest?.tag
    ? props.versionInfo.latest.tag.replace(/^v/i, '')
    : '',
)

const currentVersionText = computed(() => {
  const current = props.versionInfo?.current
  if (!current) return ''
  return /^dev$/i.test(current) ? 'dev' : `v${current.replace(/^v/i, '')}`
})

function formatDate(value?: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

function openReleasePage() {
  const url = props.versionInfo?.latest?.url
  if (url) {
    window.open(url, '_blank', 'noopener')
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="发现新版本"
    width="min(640px, 92vw)"
    append-to-body
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template v-if="versionInfo?.latest">
      <div class="update-meta">
        <el-tag type="success" effect="light">最新版本 v{{ latestTagText }}</el-tag>
        <span v-if="versionInfo.latest.publishedAt" class="update-date">
          {{ formatDate(versionInfo.latest.publishedAt) }}
        </span>
        <span class="update-current">当前版本 {{ currentVersionText }}</span>
      </div>
      <pre class="release-notes">{{ versionInfo.latest.body || '暂无更新说明' }}</pre>
    </template>
    <div v-else class="release-notes">
      {{ versionInfo?.error || '暂时无法获取更新信息' }}
    </div>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">稍后</el-button>
      <el-button type="primary" :disabled="!versionInfo?.latest?.url" @click="openReleasePage">
        前往 GitHub
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.update-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 12px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.release-notes {
  max-height: 45vh;
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
  word-break: break-word;
}
</style>
