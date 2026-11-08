<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import { serversApi, systemApi, type ServerInfo } from '@/api'
import { globalLoadingStart } from '@/utils/loading'
import StatusCard from '@/components/StatusCard.vue'
import ServerFormDrawer from '@/components/ServerFormDrawer.vue'

const TemplateEditor = defineAsyncComponent(() => import('@/components/TemplateEditor.vue'))

type StatusState = 'checking' | 'ok' | 'error'

/** ssmanager 连接状态轮询间隔（30 秒） */
const STATUS_POLL_INTERVAL = 30_000

const servers = ref<ServerInfo[]>([])
const drawerVisible = ref(false)
const editingServer = ref<ServerInfo | null>(null)
const templateVisible = ref(false)
const templatePort = ref<number | null>(null)
const expandedPorts = ref<number[]>([])

const status = ref<StatusState>('checking')
const statusAddress = ref('')
const statusError = ref('')
const statusUpdatedAt = ref('')

let statusTimer: number | undefined

const tableRows = computed(() => [...servers.value].sort((a, b) => a.port - b.port))

// el-table 的 expand-row-keys 类型为 string[]
const expandedRowKeys = computed(() => expandedPorts.value.map(String))

const serverStatusText = computed(() => {
  if (status.value === 'ok') return '运行中'
  if (status.value === 'checking') return '检测中'
  return '未知'
})

const serverStatusType = computed(() => (status.value === 'ok' ? 'success' : 'info'))

async function loadStatus(showLoading = true) {
  const endLoading = showLoading ? globalLoadingStart('刷新状态中...') : () => {}
  status.value = 'checking'
  try {
    const res = await systemApi.status({ silent: true })
    if (res.ok) {
      status.value = 'ok'
      statusAddress.value = res.address ?? ''
      statusError.value = ''
    } else {
      status.value = 'error'
      statusAddress.value = ''
      statusError.value = res.error ?? 'ssmanager 连接失败'
    }
  } catch {
    status.value = 'error'
    statusAddress.value = ''
    statusError.value = '无法连接 ssmanager，请检查服务是否运行'
  } finally {
    statusUpdatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    endLoading()
  }
}

async function loadServers() {
  const endLoading = globalLoadingStart('加载服务器列表...')
  try {
    const res = await serversApi.list()
    servers.value = Array.isArray(res.servers)
      ? res.servers
      : (res.ports ?? []).map((port) => ({ port, password: '' }))

    // 列表刷新后清理已不存在端口的展开状态
    const validPorts = new Set(servers.value.map((server) => server.port))
    expandedPorts.value = expandedPorts.value.filter((port) => validPorts.has(port))
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function handleDelete(port: number) {
  try {
    await ElMessageBox.confirm(
      `确定要删除端口 ${port} 上的服务器吗？删除后该端口将停止监听。`,
      '删除确认',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    )
  } catch {
    return // 用户取消
  }

  const endLoading = globalLoadingStart('删除服务器中...')
  try {
    await serversApi.remove(port)
    ElMessage.success(`端口 ${port} 已删除`)
    await loadServers()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function handleRowClick(row: ServerInfo) {
  const index = expandedPorts.value.indexOf(row.port)
  if (index >= 0) {
    expandedPorts.value.splice(index, 1)
  } else {
    expandedPorts.value.push(row.port)
  }
}

// 展开箭头等内部切换时同步受控的展开端口列表
// Element Plus 普通表格的 expand-change 第二参为已展开行数组
function handleExpandChange(row: ServerInfo, expanded: boolean | ServerInfo[]) {
  const isExpanded = Array.isArray(expanded)
    ? expanded.some((item) => item.port === row.port)
    : expanded
  const index = expandedPorts.value.indexOf(row.port)
  if (isExpanded && index < 0) {
    expandedPorts.value.push(row.port)
  } else if (!isExpanded && index >= 0) {
    expandedPorts.value.splice(index, 1)
  }
}

function openAdd() {
  editingServer.value = null
  drawerVisible.value = true
}

function openEdit(server: ServerInfo) {
  editingServer.value = server
  drawerVisible.value = true
}

function handleFormSuccess() {
  void loadServers()
}

function openTemplate(server: ServerInfo) {
  templatePort.value = server.port
  templateVisible.value = true
}

onMounted(() => {
  void loadStatus()
  void loadServers()
  // 定时轮询不显示全局 Loading
  statusTimer = window.setInterval(() => void loadStatus(false), STATUS_POLL_INTERVAL)
})

onUnmounted(() => {
  if (statusTimer !== undefined) {
    window.clearInterval(statusTimer)
    statusTimer = undefined
  }
})
</script>

<template>
  <div class="servers-page">
    <StatusCard :status="status" :address="statusAddress" :error="statusError" :updated-at="statusUpdatedAt"
      @refresh="loadStatus()" />

    <el-card class="servers-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-header-title">服务器列表</span>
          <el-button type="primary" :icon="Plus" @click="openAdd">添加服务器</el-button>
        </div>
      </template>

      <el-table
        :data="tableRows"
        row-key="port"
        :expand-row-keys="expandedRowKeys"
        empty-text="暂无服务器，点击「添加服务器」创建"
        border
        @row-click="(row) => handleRowClick(row as ServerInfo)"
        @expand-change="
          (row, expanded) =>
            handleExpandChange(row as ServerInfo, expanded as boolean | ServerInfo[])
        "
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="server-detail" @click.stop>
              <el-alert
                v-if="row.configKnown === false"
                class="external-alert"
                type="info"
                :closable="false"
                show-icon
                title="外部创建，高级配置无法回显"
              />
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="无延迟">
                  {{ row.noDelay ? '开启' : '关闭' }}
                </el-descriptions-item>
                <el-descriptions-item label="插件">{{ row.plugin || '-' }}</el-descriptions-item>
                <el-descriptions-item label="插件参数">{{ row.pluginOpts || '-' }}</el-descriptions-item>
                <el-descriptions-item label="插件模式">{{ row.pluginMode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="传输模式">{{ row.mode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="用户数">{{ row.users?.length ?? 0 }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="row.users?.length" class="user-detail">
                <div class="detail-label">用户列表</div>
                <div class="user-tags">
                  <el-tag
                    v-for="(user, index) in row.users"
                    :key="index"
                    size="small"
                    effect="light"
                  >
                    {{ user.username || user.name || '-' }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="port" label="端口" width="160">
          <template #default="{ row }">
            <span class="port-text">{{ row.port }}</span>
          </template>
        </el-table-column>
        <el-table-column label="加密方式" min-width="240">
          <template #default="{ row }">
            <span class="method-text">{{ row.method || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default>
            <el-tag :type="serverStatusType" effect="light" round>{{ serverStatusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300">
          <template #default="{ row }">
            <el-button
              size="small"
              :icon="Edit"
              @click.stop="openEdit(row as ServerInfo)"
            >
              编辑
            </el-button>
            <el-button size="small" @click.stop="openTemplate(row as ServerInfo)">配置模板</el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :icon="Delete"
              @click.stop="handleDelete(row.port)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ServerFormDrawer v-model="drawerVisible" :server="editingServer" @success="handleFormSuccess" />

    <TemplateEditor v-model="templateVisible" :port="templatePort" />
  </div>
</template>

<style scoped>
.servers-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.servers-card :deep(.el-card__body) {
  padding-top: 8px;
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

.server-detail {
  padding: 12px 16px;
}

.external-alert {
  margin-bottom: 12px;
}

.detail-label {
  margin: 12px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.user-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
