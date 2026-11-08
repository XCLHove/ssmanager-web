<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Monitor, SwitchButton, Ticket, TrendCharts, User, UserFilled } from '@element-plus/icons-vue'
import { clearAuth } from '@/utils/auth'
import { resetPublicKeyCache } from '@/utils/crypto'
import { globalLoadingStart } from '@/utils/loading'
import { clearSessionUser, ensureMe, session } from '@/utils/session'

const route = useRoute()
const router = useRouter()

const activeMenu = computed(() => route.path)
const pageTitle = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : ''))
const roleText = computed(() => (session.role === 'admin' ? '管理员' : '用户'))

onMounted(async () => {
  const endLoading = globalLoadingStart('加载中...')
  try {
    await ensureMe()
  } finally {
    endLoading()
  }
})

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
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="layout-aside">
      <div class="brand">
        <el-icon :size="22"><Monitor /></el-icon>
        <span>ssmanager</span>
      </div>
      <el-menu
        router
        :default-active="activeMenu"
        background-color="#1d2530"
        text-color="#aeb6c2"
        active-text-color="#ffffff"
        class="layout-menu"
      >
        <template v-if="session.role === 'admin'">
          <el-menu-item index="/servers">
            <el-icon><Monitor /></el-icon>
            <span>服务器管理</span>
          </el-menu-item>
          <el-menu-item index="/stats">
            <el-icon><TrendCharts /></el-icon>
            <span>流量统计</span>
          </el-menu-item>
          <el-menu-item index="/users">
            <el-icon><User /></el-icon>
            <span>用户管理</span>
          </el-menu-item>
          <el-menu-item index="/codes">
            <el-icon><Ticket /></el-icon>
            <span>注册码管理</span>
          </el-menu-item>
        </template>
        <el-menu-item v-else index="/my-servers">
          <el-icon><Monitor /></el-icon>
          <span>我的服务器</span>
        </el-menu-item>
        <el-menu-item v-if="session.role === 'user'" index="/account">
          <el-icon><User /></el-icon>
          <span>用户管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout-header">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <el-icon :size="18"><UserFilled /></el-icon>
          <span class="username">{{ session.username || '加载中...' }}</span>
          <el-tag size="small" :type="session.role === 'admin' ? 'danger' : 'info'" effect="light">
            {{ roleText }}
          </el-tag>
          <el-divider direction="vertical" />
          <el-button text :icon="SwitchButton" @click="handleLogout">退出登录</el-button>
        </div>
      </el-header>

      <el-main class="layout-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100%;
}

.layout-aside {
  background-color: #1d2530;
  display: flex;
  flex-direction: column;
}

.brand {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #ffffff;
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 1px;
}

.layout-menu {
  border-right: none;
  flex: 1;
}

.layout-menu :deep(.el-menu-item.is-active) {
  background-color: #409eff;
}

.layout-header {
  height: 60px;
  background-color: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #606266;
}

.username {
  font-size: 14px;
}

.layout-main {
  padding: 16px;
  overflow: auto;
}
</style>
