<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue'
import type { UserServerItem } from '@/api'
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

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-header-title">已授权服务器</span>
          <el-button :icon="Refresh" @click="loadServers">刷新</el-button>
        </div>
      </template>

      <el-table :data="servers" row-key="port" empty-text="暂无已授权服务器">
        <el-table-column prop="port" label="端口" width="100">
          <template #default="{ row }">
            <span class="port-text">{{ row.port }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="host" label="地址" min-width="150" />
        <el-table-column label="加密方式" min-width="210">
          <template #default="{ row }">
            <div class="method-cell">
              <span>{{ row.method || '-' }}</span>
              <el-tag
                v-if="!isTemplateReady(row as UserServerItem)"
                type="warning"
                size="small"
                effect="light"
              >
                订阅模板未就绪
              </el-tag>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="密码槽" min-width="560">
          <template #default="{ row }">
            <div
              v-for="entry in slotEntries(row as UserServerItem)"
              :key="entry.slot"
              class="slot-row"
            >
              <el-tag
                size="small"
                :type="entry.password ? 'success' : 'info'"
                effect="light"
              >
                槽 {{ entry.slot }}
              </el-tag>

              <template v-if="entry.password">
                <el-tag
                  size="small"
                  :type="isAgeEncrypted(entry.password) ? 'success' : 'info'"
                  effect="plain"
                >
                  {{ encryptionLabel(entry.password) }}
                </el-tag>
                <el-input
                  :model-value="toAbsoluteUrl(entry.password.url)"
                  readonly
                  size="small"
                  class="slot-url"
                />
                <el-button
                  size="small"
                  @click="copyText(toAbsoluteUrl(entry.password.url))"
                >
                  复制
                </el-button>
                <el-button
                  size="small"
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
                  订阅
                </el-button>
                <span class="slot-time">{{ formatTime(entry.password.createdAt) }}</span>
                <el-button
                  size="small"
                  type="danger"
                  plain
                  @click="handleRemovePassword(entry.password)"
                >
                  删除
                </el-button>
              </template>

              <template v-else>
                <el-button
                  size="small"
                  type="primary"
                  :disabled="!(row as UserServerItem).canGenerate"
                  @click="handleGenerate((row as UserServerItem).port)"
                >
                  生成密码
                </el-button>
                <span v-if="!(row as UserServerItem).canGenerate" class="slot-hint">
                  该服务器不支持生成密码（需 2022-blake3-* 且由本面板创建）
                </span>
              </template>
            </div>
          </template>
        </el-table-column>
      </el-table>
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
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.port-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
}

.method-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.slot-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 0;
}

.slot-row + .slot-row {
  border-top: 1px dashed var(--el-border-color-lighter);
}

.slot-url {
  width: 260px;
}

.slot-time {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.slot-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
