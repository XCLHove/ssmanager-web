import { computed, markRaw, onMounted, ref, type Component } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Document,
  Monitor,
  Ticket,
  TrendCharts,
  User,
} from '@element-plus/icons-vue'
import { systemApi, type VersionInfo } from '@/api'
import { clearAuth } from '@/utils/auth'
import { resetPublicKeyCache } from '@/utils/crypto'
import { globalLoadingStart } from '@/utils/loading'
import { clearSessionUser, ensureMe, session } from '@/utils/session'

export interface MainMenuItem {
  path: string
  title: string
  icon: Component
}

const icons = {
  monitor: markRaw(Monitor),
  document: markRaw(Document),
  trendCharts: markRaw(TrendCharts),
  user: markRaw(User),
  ticket: markRaw(Ticket),
}

const UPDATE_SEEN_KEY = 'ssmanager_web_update_seen'

export function useMainLayout() {
  const route = useRoute()
  const router = useRouter()

  const activeMenu = computed(() => route.path)
  const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
  const roleText = computed(() => (session.role === 'admin' ? '管理员' : '用户'))

  const menuItems = computed<MainMenuItem[]>(() => {
    if (session.role === 'admin') {
      return [
        { path: '/servers', title: '服务器管理', icon: icons.monitor },
        { path: '/templates', title: '模板管理', icon: icons.document },
        { path: '/stats', title: '流量统计', icon: icons.trendCharts },
        { path: '/users', title: '用户管理', icon: icons.user },
        { path: '/codes', title: '注册码管理', icon: icons.ticket },
      ]
    }
    return [
      { path: '/my-servers', title: '我的服务器', icon: icons.monitor },
      { path: '/account', title: '用户管理', icon: icons.user },
    ]
  })

  const versionInfo = ref<VersionInfo | null>(null)
  const updateDialogVisible = ref(false)

  const latestTagText = computed(() =>
    versionInfo.value?.latest?.tag
      ? versionInfo.value.latest.tag.replace(/^v/i, '')
      : '',
  )

  const currentVersionText = computed(() => {
    const current = versionInfo.value?.current
    if (!current) return ''
    return /^dev$/i.test(current) ? 'dev' : `v${current.replace(/^v/i, '')}`
  })

  function formatDate(value?: string | null): string {
    if (!value) return ''
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
  }

  async function loadVersion() {
    try {
      const info = await systemApi.version({ silent: true })
      versionInfo.value = info
      if (info.hasUpdate && info.latest?.tag) {
        if (sessionStorage.getItem(UPDATE_SEEN_KEY) !== info.latest.tag) {
          updateDialogVisible.value = true
          sessionStorage.setItem(UPDATE_SEEN_KEY, info.latest.tag)
        }
      }
    } catch {
      // 版本检查失败不影响页面
    }
  }

  function openReleasePage() {
    const url = versionInfo.value?.latest?.url
    if (url) {
      window.open(url, '_blank', 'noopener')
    }
  }

  async function handleLogout() {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '退出登录', {
        confirmButtonText: '退出',
        cancelButtonText: '取消',
        type: 'warning',
      })
    } catch {
      return // 用户取消
    }

    clearAuth()
    clearSessionUser()
    resetPublicKeyCache()
    ElMessage.success('已退出登录')
    await router.replace({ name: 'login' })
  }

  onMounted(async () => {
    const endLoading = globalLoadingStart('加载中...')
    try {
      await ensureMe()
    } finally {
      endLoading()
    }
    void loadVersion()
  })

  return {
    route,
    router,
    session,
    activeMenu,
    pageTitle,
    roleText,
    menuItems,
    versionInfo,
    updateDialogVisible,
    latestTagText,
    currentVersionText,
    formatDate,
    loadVersion,
    openReleasePage,
    handleLogout,
  }
}
