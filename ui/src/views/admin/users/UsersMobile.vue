<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue'
import type { AdminUserItem } from '@/api'
import { useUsersPage } from './useUsersPage'
import ResetPasswordDialog from './ResetPasswordDialog.vue'
import UserGrantsDrawer from './UserGrantsDrawer.vue'

const {
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
} = useUsersPage()
</script>

<template>
  <div class="users-page">
    <el-card shadow="never">
      <div class="search-area">
        <el-input
          v-model="keyword"
          placeholder="搜索用户名"
          clearable
          @keyup.enter="handleSearch"
        />
        <div class="search-actions">
          <el-button type="primary" :icon="Search" @click="handleSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="loadUsers">刷新</el-button>
        </div>
      </div>
    </el-card>

    <div class="user-list">
      <el-card v-for="user in users" :key="user.id" shadow="never" class="user-card">
        <div class="card-header">
          <span class="username">{{ user.username }}</span>
          <el-switch
            :model-value="user.enabled"
            @change="
              (value) =>
                toggleEnabled(user as AdminUserItem, Boolean(value))
            "
          />
        </div>

        <div class="meta-tags">
          <el-tag size="small" effect="light">授权 {{ user.grantCount }}</el-tag>
          <el-tag size="small" type="info" effect="light">密码 {{ user.passwordCount }}</el-tag>
        </div>

        <div class="meta-list">
          <div class="meta-item">
            <span class="meta-label">创建时间</span>
            <span class="meta-value">{{ formatTime(user.createdAt) }}</span>
          </div>
          <div class="meta-item">
            <span class="meta-label">最后登录</span>
            <span class="meta-value">{{ formatTime(user.lastLoginAt) }}</span>
          </div>
        </div>

        <div class="card-actions">
          <el-button @click="openResetPassword(user)">重置密码</el-button>
          <el-button type="primary" plain @click="openGrants(user)">授权</el-button>
          <el-button type="danger" plain @click="handleRemoveUser(user)">删除</el-button>
        </div>
      </el-card>

      <el-empty v-if="users.length === 0" description="暂无用户" />
    </div>

    <div v-if="total > 0" class="pagination-row">
      <span class="total-text">共 {{ total }} 条</span>
      <el-select
        v-model="pageSize"
        size="small"
        class="page-size-select"
        @change="handleSizeChange"
      >
        <el-option label="10 条" :value="10" />
        <el-option label="20 条" :value="20" />
        <el-option label="50 条" :value="50" />
      </el-select>
      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :pager-count="5"
        size="small"
        layout="prev, pager, next"
        @current-change="() => loadUsers()"
      />
    </div>

    <ResetPasswordDialog
      v-model:visible="resetDialogVisible"
      :user="resetTarget"
      @updated="loadUsers"
    />

    <UserGrantsDrawer
      v-model:visible="grantDrawerVisible"
      :user="grantTarget"
      @saved="loadUsers"
    />
  </div>
</template>

<style scoped>
.users-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-area {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.search-actions {
  display: flex;
  gap: 8px;
}

.search-actions :deep(.el-button) {
  flex: 1;
  margin-left: 0;
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-card :deep(.el-card__body) {
  padding: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.username {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  word-break: break-all;
}

.meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.meta-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 10px;
  font-size: 13px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}

.meta-label {
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
}

.meta-value {
  min-width: 0;
  text-align: right;
  color: var(--el-text-color-regular);
  word-break: break-all;
}

.card-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.card-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.pagination-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding-bottom: 8px;
}

.page-size-select {
  width: 88px;
}

.total-text {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.pagination-row :deep(.el-pagination) {
  flex-wrap: wrap;
  justify-content: center;
}
</style>
