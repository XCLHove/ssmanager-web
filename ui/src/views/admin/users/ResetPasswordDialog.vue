<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { md5 } from 'js-md5'
import { adminApi, type AdminUserItem } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const props = defineProps<{
  visible: boolean
  user: AdminUserItem | null
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'updated'): void
}>()

const formRef = ref<FormInstance>()
const form = reactive({
  password: '',
  confirmPassword: '',
})

function validateConfirmPassword(
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
) {
  if (!value) {
    callback(new Error('请再次输入新密码'))
  } else if (value !== form.password) {
    callback(new Error('两次输入的密码不一致'))
  } else {
    callback()
  }
}

const rules: FormRules = {
  password: [{ required: true, message: '请输入新密码', trigger: 'blur' }],
  confirmPassword: [{ validator: validateConfirmPassword, trigger: 'blur' }],
}

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return
    form.password = ''
    form.confirmPassword = ''
    void nextTick(() => formRef.value?.clearValidate())
  },
)

async function handleSubmit() {
  if (!props.user) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  const endLoading = globalLoadingStart('重置密码中...')
  try {
    await adminApi.users.resetPassword(props.user.id, md5(form.password))
    ElMessage.success('密码已重置')
    emit('update:visible', false)
    emit('updated')
  } catch {
    // 错误提示已由 axios 拦截器统一处理
  } finally {
    endLoading()
  }
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    title="重置密码"
    width="min(420px, 92vw)"
    destroy-on-close
    @update:model-value="emit('update:visible', $event)"
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-width="90px">
      <el-form-item label="用户">
        <span>{{ user?.username || '-' }}</span>
      </el-form-item>
      <el-form-item label="新密码" prop="password">
        <el-input v-model="form.password" type="password" show-password placeholder="请输入新密码" />
      </el-form-item>
      <el-form-item label="确认密码" prop="confirmPassword">
        <el-input
          v-model="form.confirmPassword"
          type="password"
          show-password
          placeholder="请再次输入新密码"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="emit('update:visible', false)">取消</el-button>
      <el-button type="primary" @click="handleSubmit">确定</el-button>
    </template>
  </el-dialog>
</template>
