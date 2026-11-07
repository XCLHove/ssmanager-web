<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Key, Lock, Ticket, User } from '@element-plus/icons-vue'
import { md5 } from 'js-md5'
import { authApi } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const router = useRouter()

const formRef = ref<FormInstance>()
const submitting = ref(false)
const form = reactive({
  username: '',
  password: '',
  confirmPassword: '',
  code: '',
})

const validateConfirmPassword = (
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
) => {
  if (!value) {
    callback(new Error('请再次输入密码'))
  } else if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,32}$/,
      message: '用户名需为 2-32 位字母、数字、下划线或短横线',
      trigger: 'blur',
    },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
  code: [{ required: true, message: '请输入注册码', trigger: 'blur' }],
}

async function handleRegister() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  submitting.value = true
  const endLoading = globalLoadingStart('注册中...')
  try {
    await authApi.register(form.username.trim(), md5(form.password), form.code.trim())
    ElMessage.success('注册成功，请登录')
    await router.replace({ name: 'login' })
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    submitting.value = false
    endLoading()
  }
}
</script>

<template>
  <div class="register-page">
    <el-card class="register-card" shadow="always">
      <div class="register-title">
        <el-icon :size="28" color="#409eff"><Key /></el-icon>
        <h1>注册账号</h1>
        <p>使用管理员提供的注册码创建账号</p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @keyup.enter="handleRegister"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            placeholder="2-32 位字母、数字、下划线或短横线"
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
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="form.confirmPassword"
            type="password"
            placeholder="请再次输入密码"
            :prefix-icon="Lock"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
        <el-form-item label="注册码" prop="code">
          <el-input
            v-model="form.code"
            placeholder="请输入注册码，如 XXXX-XXXX-XXXX"
            :prefix-icon="Ticket"
            clearable
          />
        </el-form-item>
        <el-form-item>
          <el-button
            class="register-button"
            type="primary"
            :disabled="submitting"
            @click="handleRegister"
          >
            注 册
          </el-button>
        </el-form-item>
      </el-form>

      <div class="register-footer">
        <span>已有账号？</span>
        <el-button link type="primary" @click="router.push({ name: 'login' })">
          返回登录
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.register-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 30%, rgba(64, 158, 255, 0.12), transparent 40%),
    radial-gradient(circle at 80% 70%, rgba(103, 194, 58, 0.1), transparent 40%),
    #f5f7fa;
}

.register-card {
  width: 400px;
  border-radius: 10px;
}

.register-title {
  text-align: center;
  margin-bottom: 18px;
}

.register-title h1 {
  font-size: 20px;
  margin: 10px 0 6px;
  color: #303133;
}

.register-title p {
  margin: 0;
  font-size: 13px;
  color: #909399;
}

.register-button {
  width: 100%;
}

.register-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
