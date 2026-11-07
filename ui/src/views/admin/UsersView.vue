<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Refresh, Search } from '@element-plus/icons-vue'
import { md5 } from 'js-md5'
import {
  adminApi,
  serversApi,
  type AdminUserItem,
  type ServerInfo,
} from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const users = ref<AdminUserItem[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(10)
const keyword = ref('')

const resetDialogVisible = ref(false)
const resetFormRef = ref<FormInstance>()
const resetTarget = ref<AdminUserItem | null>(null)
const resetForm = reactive({
  password: '',
  confirmPassword: '',
})

const grantDrawerVisible = ref(false)
const grantTarget = ref<AdminUserItem | null>(null)
const grantServers = ref<ServerInfo[]>([])
const selectedPorts = ref<number[]>([])
const savingGrants = ref(false)

const validateConfirmPassword = (
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
  } else if (value !== resetForm.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const resetRules: FormRules = {
  password: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
}

function formatTime(value?: number | null): string {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
}

function isGrantable(server: ServerInfo): boolean {
  return server.configKnown === true && !!server.method?.startsWith('2022-blake3-')
}

async function loadUsers() {
  const endLoading = globalLoadingStart('加载用户列表...')
  try {
    const res = await adminApi.users.list(keyword.value.trim(), page.value, pageSize.value)
    users.value = res.items
    total.value = res.total
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function handleSearch() {
  page.value = 1
  void loadUsers()
}

function handleSizeChange() {
  page.value = 1
  void loadUsers()
}

async function toggleEnabled(user: AdminUserItem, enabled: boolean) {
  const endLoading = globalLoadingStart('更新用户状态中...')
  try {
    await adminApi.users.setEnabled(user.id, enabled)
    user.enabled = enabled
    ElMessage.success(enabled ? '用户已启用' : '用户已禁用')
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

function openResetPassword(user: AdminUserItem) {
  resetTarget.value = user
  resetForm.password = ''
  resetForm.confirmPassword = ''
  resetDialogVisible.value = true
  void nextTick(() => resetFormRef.value?.clearValidate())
}

async function handleResetPassword() {
  if (!resetTarget.value) return
  const valid = await resetFormRef.value?.validate().catch(() => false)
  if (!valid) return

  const endLoading = globalLoadingStart('重置密码中...')
  try {
    await adminApi.users.resetPassword(resetTarget.value.id, md5(resetForm.password))
    ElMessage.success('密码已重置')
    resetDialogVisible.value = false
    await loadUsers()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function openGrants(user: AdminUserItem) {
  grantTarget.value = user
  grantServers.value = []
  selectedPorts.value = []
  grantDrawerVisible.value = true

  const endLoading = globalLoadingStart('加载授权信息...')
  try {
    const [grants, serversResult] = await Promise.all([
      adminApi.users.getGrants(user.id),
      serversApi.list(),
    ])
    grantServers.value = Array.isArray(serversResult.servers)
      ? serversResult.servers
      : (serversResult.ports ?? []).map((port) => ({ port, password: '' }))

    const grantablePorts = new Set(
      grantServers.value.filter((server) => isGrantable(server)).map((server) => server.port),
    )
    selectedPorts.value = grants.ports.filter((port) => grantablePorts.has(port))
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}

async function handleSaveGrants() {
  if (!grantTarget.value || savingGrants.value) return
  savingGrants.value = true
  const endLoading = globalLoadingStart('保存授权中...')
  try {
    await adminApi.users.setGrants(grantTarget.value.id, selectedPorts.value)
    ElMessage.success('授权已保存')
    grantDrawerVisible.value = false
    await loadUsers()
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    savingGrants.value = false
    endLoading()
  }
}

onMounted(() => {
  void loadUsers()
})
</script>

<template>
  <div class="users-page">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索用户名"
          clearable
          class="search-input"
          @keyup.enter="handleSearch"
        />
        <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
        <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
      </div>
    </el-card>

    <el-card shadow="never">
      <el-table :data="users" row-key="id" empty-text="暂无用户">
        <el-table-column prop="username" label="用户名" min-width="160" />
        <el-table-column label="启用" width="100">
          <template #default="{ row }">
            <el-switch
              :model-value="row.enabled"
              @change="
                (value) =>
                  toggleEnabled(row as AdminUserItem, Boolean(value))
              "
            />
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="最后登录" min-width="170">
          <template #default="{ row }">{{ formatTime(row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column prop="grantCount" label="授权数" width="100" />
        <el-table-column prop="passwordCount" label="密码数" width="100" />
        <el-table-column label="操作" width="220">
          <template #default="{ row }">
            <el-button size="small" @click="openResetPassword(row as AdminUserItem)">
              重置密码
            </el-button>
            <el-button size="small" type="primary" plain @click="openGrants(row as AdminUserItem)">
              授权
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-row">
        <el-pagination
          v-model:current-page="page"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50]"
          layout="total, sizes, prev, pager, next"
          @current-change="() => loadUsers()"
          @size-change="handleSizeChange"
        />
      </div>
    </el-card>

    <el-dialog v-model="resetDialogVisible" title="重置密码" width="420px" destroy-on-close>
      <el-form
        ref="resetFormRef"
        :model="resetForm"
        :rules="resetRules"
        label-width="90px"
      >
        <el-form-item label="用户">
          <span>{{ resetTarget?.username || '-' }}</span>
        </el-form-item>
        <el-form-item label="新密码" prop="password">
          <el-input v-model="resetForm.password" type="password" show-password placeholder="请输入新密码" />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="resetForm.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入新密码"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="resetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleResetPassword">确定</el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="grantDrawerVisible"
      title="服务器授权"
      direction="rtl"
      size="520px"
      destroy-on-close
    >
      <div v-if="grantTarget" class="grant-user">用户：{{ grantTarget.username }}</div>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="仅支持已由本面板创建且加密方式为 2022-blake3-* 的服务器"
        class="grant-alert"
      />

      <el-checkbox-group v-model="selectedPorts" class="grant-list">
        <div v-for="server in grantServers" :key="server.port" class="grant-row">
          <el-checkbox :value="server.port" :disabled="!isGrantable(server)">
            <span class="grant-port">{{ server.port }}</span>
            <span class="grant-method">{{ server.method || '未知加密方式' }}</span>
            <span v-if="!isGrantable(server)" class="grant-hint">
              不可授权（外部创建或非 2022 方法）
            </span>
          </el-checkbox>
        </div>
      </el-checkbox-group>

      <el-empty v-if="grantServers.length === 0" description="暂无服务器" />

      <template #footer>
        <el-button @click="grantDrawerVisible = false">取消</el-button>
        <el-button type="primary" :disabled="savingGrants" @click="handleSaveGrants">
          保存
        </el-button>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.search-input {
  width: 260px;
}

.pagination-row {
  display: flex;
  justify-content: flex-end;
  margin-top: 16px;
}

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
