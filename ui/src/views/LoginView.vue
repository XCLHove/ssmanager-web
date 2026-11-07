<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Lock, Key, User } from '@element-plus/icons-vue'
import { md5 } from 'js-md5'
import { authApi } from '@/api'
import {
  getRememberedCredentials,
  saveRememberedCredentials,
  setRole,
  setSessionKey,
  setToken,
} from '@/utils/auth'
import { generateSessionKey, resetPublicKeyCache } from '@/utils/crypto'
import { globalLoadingStart } from '@/utils/loading'
import { setSessionUser } from '@/utils/session'

const router = useRouter()
const route = useRoute()

const remembered = getRememberedCredentials()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  username: remembered.username,
  password: remembered.password,
})
const rememberUsername = ref(!!remembered.username || !!remembered.password)
const rememberPassword = ref(!!remembered.password)

// 记住密码时必然记住账户；取消记住账户时同时取消记住密码
watch(rememberPassword, (checked) => {
  if (checked) rememberUsername.value = true
})
watch(rememberUsername, (checked) => {
  if (!checked) rememberPassword.value = false
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const endLoading = globalLoadingStart('登录中...')
  try {
    const username = form.username.trim()
    // 登录提交 md5 小写 hex，记住密码仍存储用户输入的明文用于回填
    const sessionKey = generateSessionKey()
    const res = await authApi.login(username, md5(form.password), sessionKey)
    setToken(res.token)
    setSessionKey(sessionKey)
    setRole(res.role)
    setSessionUser({ userId: res.userId, username: res.username, role: res.role })
    resetPublicKeyCache()
    saveRememberedCredentials(username, form.password, rememberUsername.value, rememberPassword.value)
    ElMessage.success('登录成功')

    // 登录成功后回到来源页面（路由守卫重定向时记录的地址）
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect ? route.query.redirect : '/'
    await router.replace(redirect)
  } catch {
    // 登录失败的错误提示已由 axios 拦截器统一处理
  } finally {
    submitting.value = false
    endLoading()
  }
}
</script>

<template>
  <div class="login-page">
    <el-card class="login-card" shadow="always">
      <div class="login-title">
        <el-icon :size="28" color="#409eff"><Key /></el-icon>
        <h1>ssmanager 管理控制台</h1>
        <p>请登录以管理 shadowsocks-rust 服务端</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @keyup.enter="handleLogin"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="请输入用户名"
            :prefix-icon="User"
            clearable
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
          />
        </el-form-item>
        <el-form-item>
          <el-checkbox v-model="rememberUsername">记住账户</el-checkbox>
          <el-checkbox v-model="rememberPassword">记住密码</el-checkbox>
        </el-form-item>
        <el-form-item>
          <el-button class="login-button" type="primary" :disabled="submitting" @click="handleLogin">
            登 录
          </el-button>
        </el-form-item>
      </el-form>

      <div class="login-footer">
        <span>还没有账号？</span>
        <el-button link type="primary" @click="router.push({ name: 'register' })">
          注册账号
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 30%, rgba(64, 158, 255, 0.12), transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(103, 194, 58, 0.1), transparent 40%),
    #f5f7fa;
}

.login-card {
  width: 400px;
  border-radius: 10px;
}

.login-title {
  text-align: center;
  margin-bottom: 18px;
}

.login-title h1 {
  font-size: 20px;
  margin: 10px 0 6px;
  color: #303133;
}

.login-title p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.login-button {
  width: 100%;
}

.el-checkbox + .el-checkbox {
  margin-left: 16px;
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
