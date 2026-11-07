<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { CopyDocument, Delete, Plus, Refresh } from '@element-plus/icons-vue'
import {
  adminApi,
  type CodeStatus,
  type RegistrationCodeItem,
} from '@/api'
import { globalLoadingStart } from '@/utils/loading'

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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('已复制')
    return
  } catch {
    // 非安全上下文等场景回退到 execCommand
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  if (ok) {
    ElMessage.success('已复制')
  } else {
    ElMessage.error('复制失败，请手动复制')
  }
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
</script>

<template>
  <div class="codes-page">
    <el-card shadow="never">
      <template #header>
        <span class="card-header-title">批量生成注册码</span>
      </template>
      <div class="generate-row">
        <span class="generate-label">生成数量</span>
        <el-input-number
          v-model="generateCount"
          :min="1"
          :max="50"
          :precision="0"
          :controls="false"
          class="count-input"
        />
        <el-button
          type="primary"
          :icon="Plus"
          :disabled="generating"
          @click="handleGenerate"
        >
          生成
        </el-button>
        <el-button :icon="CopyDocument" @click="handleCopyAllUnused">
          复制全部未使用
        </el-button>
        <span class="generate-tip">单次最多生成 50 个，格式为 XXXX-XXXX-XXXX</span>
      </div>
    </el-card>

    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <div class="list-title">
            <span class="card-header-title">注册码列表</span>
            <el-tag type="success" size="small" effect="light">未使用 {{ unusedCount }}</el-tag>
            <el-tag type="info" size="small" effect="light">已使用 {{ usedCount }}</el-tag>
          </div>
          <div class="list-actions">
            <el-select v-model="statusFilter" class="status-select" @change="loadCodes">
              <el-option label="全部" value="" />
              <el-option label="未使用" value="unused" />
              <el-option label="已使用" value="used" />
            </el-select>
            <el-button :icon="Refresh" @click="loadCodes">刷新</el-button>
          </div>
        </div>
      </template>

      <el-table :data="items" row-key="id" empty-text="暂无注册码">
        <el-table-column label="注册码" min-width="200">
          <template #default="{ row }">
            <span class="code-text">{{ row.code }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag
              :type="isUsed(row as RegistrationCodeItem) ? 'info' : 'success'"
              size="small"
              effect="light"
            >
              {{ isUsed(row as RegistrationCodeItem) ? '已使用' : '未使用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="使用时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.usedAt) }}</template>
        </el-table-column>
        <el-table-column label="使用者" min-width="140">
          <template #default="{ row }">{{ row.usedByUsername || '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="190">
          <template #default="{ row }">
            <el-button size="small" :icon="CopyDocument" @click="copyText(row.code)">
              复制
            </el-button>
            <el-button
              type="danger"
              size="small"
              plain
              :icon="Delete"
              :disabled="isUsed(row as RegistrationCodeItem)"
              @click="handleRemove(row as RegistrationCodeItem)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<style scoped>
.codes-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.list-title,
.list-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.generate-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.generate-label {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.count-input {
  width: 110px;
}

.generate-tip {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.status-select {
  width: 130px;
}

.code-text {
  font-family: 'JetBrains Mono', Consolas, monospace;
  font-weight: 600;
}
</style>
