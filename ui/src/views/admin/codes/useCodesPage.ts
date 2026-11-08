import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, type CodeStatus, type RegistrationCodeItem } from '@/api'
import { copyText } from '@/utils/clipboard'
import { globalLoadingStart } from '@/utils/loading'

/** 注册码页面的生成、筛选、复制、删除等逻辑 */
export function useCodesPage() {
  const items = ref<RegistrationCodeItem[]>([])
  const unusedCount = ref(0)
  const usedCount = ref(0)
  const statusFilter = ref<'' | CodeStatus>('')
  const generateCount = ref(1)
  const generating = ref(false)

  function isUsed(item: RegistrationCodeItem): boolean {
    return item.usedAt !== null && item.usedAt !== undefined
  }

  function formatTime(value?: number | null): string {
    return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
  }

  async function copyCode(code: string) {
    await copyText(code)
  }

  async function loadCodes() {
    const endLoading = globalLoadingStart('加载注册码...')
    try {
      const res = await adminApi.codes.list(statusFilter.value || undefined)
      items.value = res.items
      unusedCount.value = res.unused
      usedCount.value = res.used
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  function handleStatusChange() {
    void loadCodes()
  }

  async function handleGenerate() {
    if (generating.value) return
    generating.value = true
    const endLoading = globalLoadingStart('生成注册码中...')
    try {
      const res = await adminApi.codes.generate(generateCount.value)
      ElMessage.success(`已生成 ${res.codes.length} 个注册码`)
      await loadCodes()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      generating.value = false
      endLoading()
    }
  }

  async function handleCopyAllUnused() {
    const endLoading = globalLoadingStart('获取未使用注册码...')
    try {
      const res = await adminApi.codes.list('unused')
      if (res.items.length === 0) {
        ElMessage.info('暂无未使用注册码')
        return
      }
      await copyText(res.items.map((item) => item.code).join('\n'))
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  async function handleRemove(item: RegistrationCodeItem) {
    try {
      await ElMessageBox.confirm(`确定要删除注册码 ${item.code} 吗？`, '删除注册码', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return
    }

    const endLoading = globalLoadingStart('删除注册码中...')
    try {
      await adminApi.codes.remove(item.id)
      ElMessage.success('注册码已删除')
      await loadCodes()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  onMounted(() => {
    void loadCodes()
  })

  return {
    items,
    unusedCount,
    usedCount,
    statusFilter,
    generateCount,
    generating,
    isUsed,
    formatTime,
    copyCode,
    loadCodes,
    handleStatusChange,
    handleGenerate,
    handleCopyAllUnused,
    handleRemove,
  }
}
