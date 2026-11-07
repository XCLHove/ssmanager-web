<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { toDataURL } from 'qrcode'
import { copyText } from '@/utils/clipboard'
import { globalLoadingStart } from '@/utils/loading'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{
  url?: string
  password?: string
  clientPassword?: string
}>()

const qrDataUrl = ref('')
let importTimer: number | undefined

const absoluteUrl = computed(() => {
  if (!props.url) return ''
  try {
    return new URL(props.url, window.location.origin).toString()
  } catch {
    return props.url
  }
})

watch(
  [visible, absoluteUrl],
  async ([open, url]) => {
    if (!open || !url) {
      qrDataUrl.value = ''
      return
    }
    try {
      qrDataUrl.value = await toDataURL(url, { width: 220, margin: 1 })
    } catch {
      qrDataUrl.value = ''
      ElMessage.error('二维码生成失败')
    }
  },
  { immediate: true },
)

watch(visible, (open) => {
  if (!open) clearImportTimer()
})

function clearImportTimer() {
  if (importTimer !== undefined) {
    window.clearTimeout(importTimer)
    importTimer = undefined
  }
}

async function handleDownload() {
  if (!absoluteUrl.value) return

  const endLoading = globalLoadingStart('下载订阅配置...')
  try {
    // 订阅接口为公开 YAML，直接 fetch，不走加密封装
    const response = await fetch(absoluteUrl.value)
    if (!response.ok) {
      throw new Error(`下载失败（HTTP ${response.status}）`)
    }
    const text = await response.text()
    const blob = new Blob([text], { type: 'text/yaml;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = 'ssmanager-subscription.yaml'
    link.click()
    URL.revokeObjectURL(href)
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '下载失败')
  } finally {
    endLoading()
  }
}

function handleImportFlClash() {
  if (!absoluteUrl.value) return

  clearImportTimer()
  const schemes = [
    'flclash://install-config?url=',
    'clashmeta://install-config?url=',
    'clash://install-config?url=',
  ]
  let index = 0

  const attempt = () => {
    if (document.visibilityState === 'hidden') return
    if (index >= schemes.length) {
      ElMessage.warning('若未拉起 FlClash，请复制 URL 手动导入')
      return
    }
    window.location.href = schemes[index] + encodeURIComponent(absoluteUrl.value)
    index += 1
    importTimer = window.setTimeout(attempt, 800)
  }

  attempt()
}

onBeforeUnmount(clearImportTimer)
</script>

<template>
  <el-dialog v-model="visible" title="订阅信息" width="480px" destroy-on-close>
    <div class="subscribe-body">
      <div class="field-label">订阅 URL</div>
      <div class="url-row">
        <el-input :model-value="absoluteUrl" readonly size="default" />
        <el-button type="primary" plain @click="copyText(absoluteUrl)">复制</el-button>
      </div>

      <div v-if="qrDataUrl" class="qr-wrap">
        <img :src="qrDataUrl" alt="订阅二维码" class="qr-image" />
      </div>

      <template v-if="password || clientPassword">
        <div v-if="clientPassword" class="secret-row">
          <span class="field-label">客户端密码</span>
          <code class="secret-text">{{ clientPassword }}</code>
          <el-button link type="primary" @click="copyText(clientPassword)">复制</el-button>
        </div>
        <div v-if="password" class="secret-row">
          <span class="field-label">密码</span>
          <code class="secret-text">{{ password }}</code>
          <el-button link type="primary" @click="copyText(password)">复制</el-button>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="subscribe-footer">
        <el-button @click="handleDownload">下载 YAML</el-button>
        <el-button type="primary" @click="handleImportFlClash">导入 FlClash</el-button>
        <el-button @click="visible = false">关闭</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.subscribe-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.url-row {
  display: flex;
  gap: 8px;
}

.qr-wrap {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}

.qr-image {
  width: 220px;
  height: 220px;
}

.secret-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.secret-text {
  flex: 1;
  min-width: 0;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.subscribe-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
