<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { adminApi, serversApi, type AdminUserItem, type ServerInfo } from '@/api'
import { useIsMobile } from '@/composables/useIsMobile'
import { globalLoadingStart } from '@/utils/loading'

const props = defineProps<{
  visible: boolean
  user: AdminUserItem | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'saved'): void
}>()

const isMobile = useIsMobile()
const drawerSize = computed(() => (isMobile.value ? '100%' : '520px'))

const servers = ref<ServerInfo[]>([])
const selectedPorts = ref<number[]>([])
const saving = ref(false)

function isGrantable(server: ServerInfo): boolean {
  return server.configKnown === true && !!server.method?.startsWith('2022-blake3-')
}

async function loadGrants(user: AdminUserItem) {
  servers.value = []
  selectedPorts.value = []

  const endLoading = globalLoadingStart('加载授权信息...')
  try {
    const [grants, serversResult] = await Promise.all([
      adminApi.users.getGrants(user.id),
      serversApi.list(),
    ])
    servers.value = Array.isArray(serversResult.servers)
      ? serversResult.servers
      : (serversResult.ports ?? []).map((port) => ({ port, password: '' }))

    const grantablePorts = new Set(
      servers.value.filter((server) => isGrantable(server)).map((server) => server.port),
    )
    selectedPorts.value = grants.ports.filter((port) => grantablePorts.has(port))
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible && props.user) {
      void loadGrants(props.user)
    }
  },
  { immediate: true },
)

async function handleSave() {
  if (!props.user || saving.value) return
  saving.value = true
  const endLoading = globalLoadingStart('保存授权中...')
  try {
    await adminApi.users.setGrants(props.user.id, selectedPorts.value)
    ElMessage.success('授权已保存')
    emit('update:visible', false)
    emit('saved')
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    saving.value = false
    endLoading()
  }
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="服务器授权"
    direction="rtl"
    :size="drawerSize"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="user" class="grant-user">用户：{{ user.username }}</div>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="仅支持已由本面板创建且加密方式为 2022-blake3-* 的服务器"
      class="grant-alert"
    />

    <el-checkbox-group v-model="selectedPorts" class="grant-list">
      <div v-for="server in servers" :key="server.port" class="grant-row">
        <el-checkbox :value="server.port" :disabled="!isGrantable(server)">
          <span class="grant-port">{{ server.port }}</span>
          <span class="grant-method">{{ server.method || '未知加密方式' }}</span>
          <span v-if="!isGrantable(server)" class="grant-hint">
            不可授权（外部创建或非 2022 方法）
          </span>
        </el-checkbox>
      </div>
    </el-checkbox-group>

    <el-empty v-if="servers.length === 0" description="暂无服务器" />

    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" :disabled="saving" @click="handleSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
.grant-user {
  margin-bottom: 12px;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.grant-alert {
  margin-bottom: 16px;
}

.grant-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.grant-row {
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.grant-port {
  display: inline-block;
  min-width: 70px;
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
}

.grant-method {
  margin-right: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
}

.grant-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
