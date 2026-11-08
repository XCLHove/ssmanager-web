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
        <el-table-column label="操作" width="320">
          <template #default="{ row }">
            <el-button size="small" @click="openResetPassword(row as AdminUserItem)">
              重置密码
            </el-button>
            <el-button size="small" type="primary" plain @click="openGrants(row as AdminUserItem)">
              授权
            </el-button>
            <el-button
              size="small"
              type="danger"
              plain
              @click="handleRemoveUser(row as AdminUserItem)"
            >
              删除
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
</style>
