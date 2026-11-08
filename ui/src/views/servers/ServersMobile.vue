<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import StatusCard from '@/components/StatusCard.vue'
import ServerFormDrawer from '@/components/ServerFormDrawer.vue'
import { useServersPage } from './useServersPage'

const TemplateEditor = defineAsyncComponent(() => import('@/components/TemplateEditor.vue'))

const {
  tableRows,
  status,
  statusAddress,
  statusError,
  statusUpdatedAt,
  mobileStatusText,
  mobileStatusType,
  userCount,
  drawerVisible,
  editingServer,
  templateVisible,
  templatePort,
  loadStatus,
  handleDelete,
  openAdd,
  openEdit,
  handleFormSuccess,
  openTemplate,
} = useServersPage()
</script>

<template>
  <div class="servers-page">
    <StatusCard
      :status="status"
      :address="statusAddress"
      :error="statusError"
      :updated-at="statusUpdatedAt"
      @refresh="loadStatus()"
    />

    <el-button type="primary" :icon="Plus" class="add-button" @click="openAdd">
      添加服务器
    </el-button>

    <el-card v-if="tableRows.length === 0" class="empty-card" shadow="never">
      <el-empty description="暂无服务器，添加一台开始使用" :image-size="90" />
    </el-card>

    <div v-else class="server-list">
      <el-card v-for="server in tableRows" :key="server.port" class="server-card" shadow="never">
        <div class="card-head">
          <div class="port-block">
            <span class="port-label">端口</span>
            <span class="port-text">{{ server.port }}</span>
          </div>
          <el-tag :type="mobileStatusType" effect="light" round>{{ mobileStatusText }}</el-tag>
        </div>

        <div class="meta-row">
          <span class="meta-label">加密方式</span>
          <span class="meta-value mono">{{ server.method || '-' }}</span>
        </div>
        <div class="meta-row">
          <span class="meta-label">用户数</span>
          <span class="meta-value">{{ userCount(server) }}</span>
        </div>

        <div class="card-actions">
          <el-button :icon="Edit" @click="openEdit(server)">编辑</el-button>
          <el-button @click="openTemplate(server)">配置模板</el-button>
          <el-button type="danger" plain :icon="Delete" @click="handleDelete(server.port)">
            删除
          </el-button>
        </div>

        <el-collapse class="detail-collapse">
          <el-collapse-item title="更多信息" name="detail">
            <el-alert
              v-if="server.configKnown === false"
              class="external-alert"
              type="info"
              :closable="false"
              show-icon
              title="外部创建，高级配置无法回显"
            />
            <div class="detail-row">
              <span class="meta-label">无延迟</span>
              <span class="meta-value">{{ server.noDelay ? '开启' : '关闭' }}</span>
            </div>
            <div class="detail-row">
              <span class="meta-label">插件</span>
              <span class="meta-value mono">{{ server.plugin || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="meta-label">插件参数</span>
              <span class="meta-value mono">{{ server.pluginOpts || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="meta-label">插件模式</span>
              <span class="meta-value mono">{{ server.pluginMode || '-' }}</span>
            </div>
            <div class="detail-row">
              <span class="meta-label">传输模式</span>
              <span class="meta-value mono">{{ server.mode || '-' }}</span>
            </div>
            <div v-if="server.users?.length" class="detail-users">
              <div class="detail-label">用户列表</div>
              <div class="user-tags">
                <el-tag
                  v-for="(user, index) in server.users"
                  :key="index"
                  size="small"
                  effect="light"
                >
                  {{ user.username || user.name || '-' }}
                </el-tag>
              </div>
            </div>
            <div v-else class="detail-row">
              <span class="meta-label">用户列表</span>
              <span class="meta-value">-</span>
            </div>
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </div>

    <ServerFormDrawer v-model="drawerVisible" :server="editingServer" @success="handleFormSuccess" />

    <TemplateEditor v-model="templateVisible" :port="templatePort" />
  </div>
</template>

<style scoped>
.servers-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.add-button {
  width: 100%;
  min-height: 40px;
}

.empty-card :deep(.el-card__body) {
  padding: 24px 12px;
}

.server-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.server-card :deep(.el-card__body) {
  padding: 14px;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.port-block {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.port-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.port-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.2;
}

.meta-row,
.detail-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 0;
  font-size: 13px;
}

.meta-label {
  flex: none;
  color: var(--el-text-color-secondary);
}

.meta-value {
  min-width: 0;
  text-align: right;
  word-break: break-all;
  color: var(--el-text-color-primary);
}

.mono {
  font-family: 'JetBrains Mono', Consolas, monospace;
}

.card-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.card-actions :deep(.el-button) {
  flex: 1 1 0;
  min-width: 0;
  min-height: 40px;
  margin-left: 0;
}

.detail-collapse {
  margin-top: 10px;
  border-top: none;
}

.detail-collapse :deep(.el-collapse-item__header) {
  height: 38px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.detail-collapse :deep(.el-collapse-item__wrap) {
  border-bottom: none;
}

.external-alert {
  margin-bottom: 10px;
}

.detail-users {
  margin-top: 8px;
}

.detail-label {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.user-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
