<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import {
  userApi,
  type UserServerItem,
  type UserServerPassword,
} from '@/api'
import SubscribeDialog from '@/components/SubscribeDialog.vue'
import { copyText } from '@/utils/clipboard'
import { globalLoadingStart } from '@/utils/loading'

const servers = ref<UserServerItem[]>([])

const subscribeVisible = ref(false)
const subscribeUrl = ref('')
const subscribePlainUrl = ref('')
const subscribePassword = ref('')
const subscribeClientPassword = ref('')
const subscribeAgePrivateKey = ref('')

function formatTime(value?: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

interface SlotEntry {
  slot: number
  password?: UserServerPassword
}

function slotEntries(row: UserServerItem): SlotEntry[] {
  const passwords = [...(row.passwords ?? [])].sort((a, b) => a.slot - b.slot)

  // 每台服务器仅生成 1 个密码；历史遗留的多条密码仍全部列出
  if (passwords.length > 0) {
    return passwords.map((password) => ({ slot: password.slot, password }))
  }

  return [{ slot: 1 }]
}

async function loadServers() {
  const endLoading = globalLoadingStart('加载服务器列表...')
  try {
    const res = await userApi.servers.list()
    servers.value = res.items
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function openSubscribe(
  url: string,
  password?: string,
  clientPassword?: string,
  agePrivateKey?: string | null,
  plainUrl?: string | null,
) {
  subscribeUrl.value = url
  subscribePlainUrl.value = plainUrl ?? ''
  subscribePassword.value = password ?? ''
  subscribeClientPassword.value = clientPassword ?? ''
  subscribeAgePrivateKey.value = agePrivateKey ?? ''
  subscribeVisible.value = true
}

async function handleGenerate(port: number) {
  const endLoading = globalLoadingStart('生成密码中...')
  try {
    const res = await userApi.passwords.generate(port)
    ElMessage.success('密码已生成')
    await loadServers()
    openSubscribe(
      res.url,
      res.password,
      res.clientPassword,
      res.agePrivateKey,
      res.plainUrl,
    )
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function handleRemovePassword(password: UserServerPassword) {
  try {
    await ElMessageBox.confirm(
      '删除密码后对应订阅 URL 将立即失效，并可能导致该端口短暂断开。确定删除吗？',
      '删除密码',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return
  }

  const endLoading = globalLoadingStart('删除密码中...')
  try {
    await userApi.passwords.remove(password.id)
    ElMessage.success('密码已删除')
    await loadServers()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

onMounted(() => {
  void loadServers()
})
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
                v-if="row.templateReady === false"
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
                  :type="entry.password.agePrivateKey ? 'success' : 'info'"
                  effect="plain"
                >
                  {{ entry.password.agePrivateKey ? 'age 加密' : '未加密' }}
                </el-tag>
                <el-input
                  :model-value="entry.password.url"
                  readonly
                  size="small"
                  class="slot-url"
                />
                <el-button size="small" @click="copyText(entry.password.url)">复制</el-button>
                <el-button
                  size="small"
                  type="primary"
                  plain
                  @click="
                    openSubscribe(
                      entry.password.url,
                      undefined,
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
      :client-password="subscribeClientPassword"
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
