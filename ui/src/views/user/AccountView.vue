<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import { useAccountPage } from './account/useAccountPage'

const isMobile = useIsMobile()
const { formRef, submitting, form, rules, username, roleText, handleChangePassword } =
  useAccountPage()
</script>

<template>
  <div class="account-page">
    <el-card shadow="never">
      <template #header>
        <span class="card-header-title">账号信息</span>
      </template>
      <el-descriptions :column="isMobile ? 1 : 2" border>
        <el-descriptions-item label="用户名">{{ username }}</el-descriptions-item>
        <el-descriptions-item label="角色">
          <el-tag size="small" type="info" effect="light">{{ roleText }}</el-tag>
        </el-descriptions-item>
      </el-descriptions>
    </el-card>

    <el-card class="password-card" shadow="never">
      <template #header>
        <span class="card-header-title">修改登录密码</span>
      </template>

      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="password-tip"
        title="修改成功后所有会话将失效，需要重新登录"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        :label-position="isMobile ? 'top' : 'right'"
        :label-width="isMobile ? undefined : '110px'"
        @keyup.enter="handleChangePassword"
      >
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input
            v-model="form.oldPassword"
            type="password"
            show-password
            placeholder="请输入当前密码"
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            placeholder="请输入新密码"
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="确认新密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            placeholder="请再次输入新密码"
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :disabled="submitting"
            class="submit-button"
            :class="{ 'is-mobile': isMobile }"
            @click="handleChangePassword"
          >
            保存
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 760px;
  min-width: 0;
}

.account-page :deep(.el-card__body) {
  min-width: 0;
}

.account-page :deep(.el-descriptions__content) {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.password-tip {
  margin-bottom: 16px;
}

.password-card :deep(.el-form) {
  width: 100%;
  max-width: 520px;
}

.submit-button.is-mobile {
  width: 100%;
}

@media (max-width: 768px) {
  .account-page {
    padding: 0;
  }

  .account-page :deep(.el-card__body) {
    padding: 14px 12px;
  }

  .password-card :deep(.el-form-item:last-child) {
    margin-bottom: 0;
  }
}
</style>
