import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, type AdminUserItem } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

/** 用户管理页面的列表、搜索、分页、启停、删除与弹层状态 */
export function useUsersPage() {
  const users = ref<AdminUserItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(10)
  const keyword = ref('')

  const resetDialogVisible = ref(false)
  const resetTarget = ref<AdminUserItem | null>(null)

  const grantDrawerVisible = ref(false)
  const grantTarget = ref<AdminUserItem | null>(null)

  function formatTime(value?: number | null): string {
    return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
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
      // 可能已更新状态但端口重建失败，重新拉取以反映实际状态；错误提示由 axios 拦截器统一处理
      await loadUsers()
    } finally {
      endLoading()
    }
  }

  function openResetPassword(user: AdminUserItem) {
    resetTarget.value = user
    resetDialogVisible.value = true
  }

  function openGrants(user: AdminUserItem) {
    grantTarget.value = user
    grantDrawerVisible.value = true
  }

  async function handleRemoveUser(user: AdminUserItem) {
    try {
      await ElMessageBox.confirm(
        `确定删除用户 ${user.username} 吗？将同时移除其服务器授权、所有密码和订阅 URL，操作不可恢复。`,
        '删除用户',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    } catch {
      return
    }

    const endLoading = globalLoadingStart('删除用户中...')
    try {
      await adminApi.users.remove(user.id)
      ElMessage.success(`用户 ${user.username} 已删除`)
      await loadUsers()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  onMounted(() => {
    void loadUsers()
  })

  return {
    users,
    total,
    page,
    pageSize,
    keyword,
    resetDialogVisible,
    resetTarget,
    grantDrawerVisible,
    grantTarget,
    formatTime,
    loadUsers,
    handleSearch,
    handleSizeChange,
    toggleEnabled,
    openResetPassword,
    openGrants,
    handleRemoveUser,
  }
}
