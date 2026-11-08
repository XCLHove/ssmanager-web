<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import SubscribeDialog from '@/components/SubscribeDialog.vue'
import { copyText } from '@/utils/clipboard'
import { toAbsoluteUrl } from '@/utils/url'
import {
  encryptionLabel,
  formatTime,
  isAgeEncrypted,
  isTemplateReady,
  slotEntries,
  useMyServersPage,
} from './useMyServersPage'

const {
  servers,
  subscribeVisible,
  subscribeUrl,
  subscribePlainUrl,
  subscribePassword,
  subscribeAgePrivateKey,
  loadServers,
  openSubscribe,
  handleGenerate,
  handleRemovePassword,
} = useMyServersPage()
</script>

<template>
  <div class="my-servers-page">
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="每个服务器仅 1 个密码；生成/删除会导致端口短暂断开，原订阅 URL 失效。"
    />

    <div class="section-header">
      <span class="section-title">已授权服务器</span>
      <el-button size="small" :icon="Refresh" @click="loadServers">刷新</el-button>
    </div>

    <el-empty
      v-if="servers.length === 0"
      description="暂无已授权服务器，请联系管理员开通"
    >
      <el-button :icon="Refresh" @click="loadServers">刷新</el-button>
    </el-empty>

    <el-card
      v-for="server in servers"
      :key="server.port"
      shadow="never"
      class="server-card"
    >
      <div class="server-head">
        <span class="port-text">端口 {{ server.port }}</span>
        <el-tag
          size="small"
          :type="isTemplateReady(server) ? 'success' : 'warning'"
          effect="light"
        >
          {{ isTemplateReady(server) ? '模板已就绪' : '模板未就绪' }}
        </el-tag>
      </div>

      <div class="info-list">
        <div class="info-row">
          <span class="info-label">地址</span>
          <span class="info-value">{{ server.host || '-' }}</span>
        </div>
        <div class="info-row">
          <span class="info-label">加密方式</span>
          <span class="info-value">{{ server.method || '-' }}</span>
        </div>
      </div>

      <div class="slot-area">
        <div v-for="entry in slotEntries(server)" :key="entry.slot" class="slot-block">
          <template v-if="entry.password">
            <div class="slot-head">
              <el-tag size="small" type="success" effect="light">
                槽 {{ entry.slot }}
              </el-tag>
              <el-tag
                size="small"
                :type="isAgeEncrypted(entry.password) ? 'success' : 'info'"
                effect="plain"
              >
                {{ encryptionLabel(entry.password) }}
              </el-tag>
            </div>

            <code class="slot-url">{{ toAbsoluteUrl(entry.password.url) }}</code>
            <div class="slot-meta">创建于 {{ formatTime(entry.password.createdAt) }}</div>

            <div class="slot-actions">
              <el-button @click="copyText(toAbsoluteUrl(entry.password.url))">
                复制链接
              </el-button>
              <el-button
                type="primary"
                plain
                @click="
                  openSubscribe(
                    entry.password.url,
                    undefined,
                    entry.password.agePrivateKey,
                    entry.password.plainUrl,
                  )
                "
              >
                订阅信息
              </el-button>
              <el-button
                type="danger"
                plain
                class="action-delete"
                @click="handleRemovePassword(entry.password)"
              >
                删除密码
              </el-button>
            </div>
          </template>

          <template v-else>
            <el-button
              type="primary"
              class="generate-button"
              :disabled="!server.canGenerate"
              @click="handleGenerate(server.port)"
            >
              生成密码
            </el-button>
            <div v-if="!server.canGenerate" class="slot-hint">
              该服务器不支持生成密码（需 2022-blake3-* 且由本面板创建）
            </div>
          </template>
        </div>
      </div>
    </el-card>

    <SubscribeDialog
      v-model="subscribeVisible"
      :url="subscribeUrl"
      :plain-url="subscribePlainUrl"
      :password="subscribePassword"
      :age-private-key="subscribeAgePrivateKey"
    />
  </div>
</template>

<style scoped>
.my-servers-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
}

.server-card {
  min-width: 0;
}

.server-card :deep(.el-card__body) {
  padding: 12px;
  min-width: 0;
}

.server-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.port-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 15px;
  font-weight: 600;
}

.info-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 10px;
}

.info-row {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
  line-height: 1.5;
}

.info-label {
  color: var(--el-text-color-secondary);
}

.info-value {
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.slot-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.slot-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.slot-block + .slot-block {
  padding-top: 10px;
  border-top: 1px dashed var(--el-border-color-lighter);
}

.slot-head {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.slot-url {
  display: block;
  max-height: 120px;
  overflow-y: auto;
  padding: 8px;
  border-radius: 6px;
  background-color: var(--el-fill-color-light);
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-regular);
  overflow-wrap: anywhere;
  word-break: break-all;
}

.slot-meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.slot-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.slot-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.slot-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.action-delete {
  grid-column: 1 / -1;
}

.generate-button {
  width: 100%;
}

.slot-hint {
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}
</style>
