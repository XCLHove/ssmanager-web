<script setup lang="ts">
import { defineAsyncComponent } from 'vue'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import type { ServerInfo } from '@/api'
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
  serverStatusText,
  serverStatusType,
  drawerVisible,
  editingServer,
  templateVisible,
  templatePort,
  expandedRowKeys,
  loadStatus,
  handleDelete,
  handleRowClick,
  handleExpandChange,
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

    <el-card class="servers-card" shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-header-title">服务器列表</span>
          <el-button type="primary" :icon="Plus" @click="openAdd">添加服务器</el-button>
        </div>
      </template>

      <el-table
        :data="tableRows"
        row-key="port"
        :expand-row-keys="expandedRowKeys"
        empty-text="暂无服务器，点击「添加服务器」创建"
        border
        @row-click="(row) => handleRowClick(row as ServerInfo)"
        @expand-change="
          (row, expanded) =>
            handleExpandChange(row as ServerInfo, expanded as boolean | ServerInfo[])
        "
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="server-detail" @click.stop>
              <el-alert
                v-if="row.configKnown === false"
                class="external-alert"
                type="info"
                :closable="false"
                show-icon
                title="外部创建，高级配置无法回显"
              />
              <el-descriptions :column="2" border size="small">
                <el-descriptions-item label="无延迟">
                  {{ row.noDelay ? '开启' : '关闭' }}
                </el-descriptions-item>
                <el-descriptions-item label="插件">{{ row.plugin || '-' }}</el-descriptions-item>
                <el-descriptions-item label="插件参数">{{ row.pluginOpts || '-' }}</el-descriptions-item>
                <el-descriptions-item label="插件模式">{{ row.pluginMode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="传输模式">{{ row.mode || '-' }}</el-descriptions-item>
                <el-descriptions-item label="用户数">{{ row.users?.length ?? 0 }}</el-descriptions-item>
              </el-descriptions>
              <div v-if="row.users?.length" class="user-detail">
                <div class="detail-label">用户列表</div>
                <div class="user-tags">
                  <el-tag
                    v-for="(user, index) in row.users"
                    :key="index"
                    size="small"
                    effect="light"
                  >
                    {{ user.username || user.name || '-' }}
                  </el-tag>
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="port" label="端口" width="160">
          <template #default="{ row }">
            <span class="port-text">{{ row.port }}</span>
          </template>
        </el-table-column>
        <el-table-column label="加密方式" min-width="240">
          <template #default="{ row }">
            <span class="method-text">{{ row.method || '-' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default>
            <el-tag :type="serverStatusType" effect="light" round>{{ serverStatusText }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="300">
          <template #default="{ row }">
            <el-button size="small" :icon="Edit" @click.stop="openEdit(row as ServerInfo)">
              编辑
            </el-button>
            <el-button size="small" @click.stop="openTemplate(row as ServerInfo)">配置模板</el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :icon="Delete"
              @click.stop="handleDelete(row.port)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <ServerFormDrawer v-model="drawerVisible" :server="editingServer" @success="handleFormSuccess" />

    <TemplateEditor v-model="templateVisible" :port="templatePort" />
  </div>
</template>

<style scoped>
.servers-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.servers-card :deep(.el-card__body) {
  padding-top: 8px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.port-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
}

.server-detail {
  padding: 12px 16px;
}

.external-alert {
  margin-bottom: 12px;
}

.detail-label {
  margin: 12px 0 8px;
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
