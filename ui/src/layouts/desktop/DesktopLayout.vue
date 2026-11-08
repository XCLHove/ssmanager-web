<script setup lang="ts">
import { Monitor, SwitchButton, UserFilled } from '@element-plus/icons-vue'
import { useMainLayout } from '../useMainLayout'
import UpdateDialog from '../UpdateDialog.vue'

const {
  session,
  activeMenu,
  pageTitle,
  roleText,
  menuItems,
  versionInfo,
  updateDialogVisible,
  latestTagText,
  currentVersionText,
  handleLogout,
} = useMainLayout()
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
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="layout-header">
        <div class="header-left">
          <span class="page-title">{{ pageTitle }}</span>
        </div>
        <div class="header-right">
          <el-tag
            v-if="versionInfo"
            size="small"
            effect="plain"
            class="version-tag"
            @click="updateDialogVisible = true"
          >
            {{ currentVersionText }}
          </el-tag>
          <el-tag
            v-if="versionInfo?.hasUpdate"
            type="warning"
            size="small"
            effect="light"
            class="version-tag"
            @click="updateDialogVisible = true"
          >
            有新版本 v{{ latestTagText }}
          </el-tag>
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

    <UpdateDialog v-model="updateDialogVisible" :version-info="versionInfo" />
  </el-container>
</template>

<style scoped>
.layout {
  height: 100%;
}

.version-tag {
  cursor: pointer;
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
