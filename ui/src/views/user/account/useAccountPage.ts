import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { md5 } from 'js-md5'
import { userApi } from '@/api'
import { clearAuth } from '@/utils/auth'
import { resetPublicKeyCache } from '@/utils/crypto'
import { globalLoadingStart } from '@/utils/loading'
import { clearSessionUser, session } from '@/utils/session'

export function useAccountPage() {
  const router = useRouter()

  const formRef = ref<FormInstance>()
  const submitting = ref(false)
  const form = reactive({
    oldPassword: '',
    newPassword: '',
    confirmPassword: '',
  })

  const username = computed(() => session.username || '-')
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

  return {
    formRef,
    submitting,
    form,
    rules,
    username,
    roleText,
    handleChangePassword,
  }
}
