<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { md5 } from 'js-md5'
import { userApi } from '@/api'
import { clearAuth } from '@/utils/auth'
import { resetPublicKeyCache } from '@/utils/crypto'
import { globalLoadingStart } from '@/utils/loading'
import { clearSessionUser, session } from '@/utils/session'

const router = useRouter()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: '',
})

const roleText = computed(() => (session.role === 'admin' ? '管理员' : '用户'))

const validateConfirmPassword = (
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
) => {
  if (!value) {
    callback(new Error('请再次输入新密码'))
  } else if (value !== form.newPassword) {
    callback(new Error('两次输入的新密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  oldPassword: [{ required: true, message: '请输入当前密码', trigger: 'blur' }],
  newPassword: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
}

async function handleChangePassword() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const endLoading = globalLoadingStart('修改密码中...')
  try {
    await userApi.changePassword(md5(form.oldPassword), md5(form.newPassword))
    ElMessage.success('密码已修改，请重新登录')
    clearAuth()
    clearSessionUser()
    resetPublicKeyCache()
    await router.replace({ name: 'login' })
  } catch {
    // 错误提示已由 axios 拦截器统一处理，表单保留
  } finally {
    submitting.value = false
    endLoading()
  }
}
</script>

<template>
  <div class="account-page">
    <el-card shadow="never">
      <template #header>
        <span class="card-header-title">账号信息</span>
      </template>
      <el-descriptions :column="2" border>
        <el-descriptions-item label="用户名">{{ session.username || '-' }}</el-descriptions-item>
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
        label-width="110px"
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
          <el-button type="primary" :disabled="submitting" @click="handleChangePassword">
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
  max-width: 760px;
}

.card-header-title {
  font-size: 15px;
  font-weight: 600;
}

.password-tip {
  margin-bottom: 16px;
}

.password-card :deep(.el-form) {
  max-width: 520px;
}
</style>
