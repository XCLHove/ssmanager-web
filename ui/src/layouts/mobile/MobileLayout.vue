<script setup lang="ts">
import { ref, watch } from 'vue'
import { Menu, Monitor, UserFilled } from '@element-plus/icons-vue'
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
  currentVersionText,
  handleLogout,
} = useMainLayout()

const drawerVisible = ref(false)

watch(activeMenu, () => {
  drawerVisible.value = false
})

function handleUserCommand(command: unknown) {
  if (command === 'logout') {
    void handleLogout()
  }
}
</script>

<template>
  <el-container class="mobile-layout">
    <el-header class="mobile-header">
      <el-button
        text
        :icon="Menu"
        class="menu-button"
        aria-label="打开菜单"
        @click="drawerVisible = true"
      />
      <span class="mobile-title">{{ pageTitle }}</span>
      <div class="mobile-header-right">
        <el-tag
          v-if="versionInfo?.hasUpdate"
          type="warning"
          size="small"
          effect="light"
          class="update-tag"
          @click="updateDialogVisible = true"
        >
          有新版本
        </el-tag>
        <el-tag
          v-else-if="versionInfo"
          size="small"
          effect="plain"
          class="update-tag"
          @click="updateDialogVisible = true"
        >
          {{ currentVersionText }}
        </el-tag>
        <el-dropdown trigger="click" @command="handleUserCommand">
          <span class="user-trigger">
            <el-icon :size="18"><UserFilled /></el-icon>
            <span class="username">{{ session.username || '加载中...' }}</span>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled>{{ roleText }}</el-dropdown-item>
              <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </el-header>

    <el-main class="mobile-main">
      <router-view />
    </el-main>

    <el-drawer
      v-model="drawerVisible"
      direction="ltr"
      size="240px"
      :with-header="false"
      class="mobile-drawer"
    >
      <div class="drawer-brand">
        <el-icon :size="22"><Monitor /></el-icon>
        <span>ssmanager</span>
      </div>
      <el-menu
        router
        :default-active="activeMenu"
        background-color="#1d2530"
        text-color="#aeb6c2"
        active-text-color="#ffffff"
        class="drawer-menu"
        @select="drawerVisible = false"
      >
        <el-menu-item v-for="item in menuItems" :key="item.path" :index="item.path">
          <el-icon><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-drawer>

    <UpdateDialog v-model="updateDialogVisible" :version-info="versionInfo" />
  </el-container>
</template>

<style scoped>
.mobile-layout {
  height: 100%;
}

.mobile-header {
  height: 52px;
  padding: 0 8px;
  background-color: #ffffff;
  border-bottom: 1px solid #e4e7ed;
  display: flex;
  align-items: center;
  gap: 4px;
}

.menu-button {
  padding: 8px;
  color: #606266;
}

.mobile-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 15px;
  font-weight: 600;
}

.mobile-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.update-tag {
  cursor: pointer;
}

.user-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  color: #606266;
  cursor: pointer;
}

.user-trigger .username {
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.mobile-main {
  padding: 12px;
  overflow: auto;
  -webkit-overflow-scrolling: touch;
}

.drawer-brand {
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

.drawer-menu {
  border-right: none;
  flex: 1;
}

.drawer-menu :deep(.el-menu-item.is-active) {
  background-color: #409eff;
}
</style>

<style>
.mobile-drawer .el-drawer__body {
  padding: 0;
  background-color: #1d2530;
  display: flex;
  flex-direction: column;
}
</style>
