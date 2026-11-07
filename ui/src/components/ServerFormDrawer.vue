<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { serversApi, type AddServerPayload, type ServerInfo } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

const visible = defineModel<boolean>({ default: false })

const props = defineProps<{ server?: ServerInfo | null }>()

const emit = defineEmits<{ success: [] }>()

const isEdit = computed(() => !!props.server)
const title = computed(() => (isEdit.value ? '编辑服务器' : '添加服务器'))

/** 编辑模式下用于 PUT URL 的原始端口（端口允许修改） */
const originalPort = ref<number | null>(null)

const METHOD_OPTIONS = [
  'aes-256-gcm',
  'aes-128-gcm',
  'chacha20-ietf-poly1305',
  'xchacha20-ietf-poly1305',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
  '2022-blake3-chacha20-poly1305',
]

const TRANSPORT_OPTIONS = ['tcp_only', 'udp_only', 'tcp_and_udp']

/** 2022-blake3-* 方法的原始密钥长度（字节） */
const KEY_LENGTHS: Record<string, number> = {
  '2022-blake3-aes-128-gcm': 16,
  '2022-blake3-aes-256-gcm': 32,
  '2022-blake3-chacha20-poly1305': 32,
}

function is2022Method(method: string): boolean {
  return method.startsWith('2022-blake3-')
}

function keyLengthForMethod(method: string): number {
  return KEY_LENGTHS[method] ?? 32
}

/** 标准 Base64（带 padding）解码后的字节长度，非法时返回 null */
function base64ByteLength(value: string): number | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null
  try {
    return atob(value).length
  } catch {
    return null
  }
}

function randomBase64(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
}

const formRef = ref<FormInstance>()
const submitting = ref(false)

const form = reactive({
  port: undefined as number | undefined,
  password: '',
  method: '',
  noDelay: false,
  plugin: '',
  pluginOpts: '',
  pluginMode: '',
  mode: '',
})

const validatePort = (_rule: unknown, value: unknown, callback: any) => {
  if (value === undefined || value === null || value === '') {
    callback(new Error('请输入端口'))
  } else if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 65535) {
    callback(new Error('端口必须是 1 - 65535 之间的整数'))
  } else {
    callback()
  }
}

const validateMainPassword = (
  _rule: unknown,
  value: unknown,
  callback: (error?: Error) => void,
) => {
  const password = String(value ?? '')
  if (!password) {
    callback(new Error('请输入密码'))
    return
  }
  if (!is2022Method(form.method)) {
    callback()
    return
  }

  const key = password.trim()
  const length = base64ByteLength(key)
  if (length === null) {
    callback(new Error('密码必须是合法的 Base64 密钥'))
    return
  }
  const expected = keyLengthForMethod(form.method)
  if (length !== expected) {
    callback(new Error(`密钥长度不匹配：${form.method} 需要 ${expected} 字节的 Base64 密钥`))
    return
  }
  callback()
}

const rules: FormRules = {
  port: [{ required: true, validator: validatePort, trigger: 'blur' }],
  password: [{ validator: validateMainPassword, trigger: 'blur' }],
  method: [{ required: true, message: '请选择加密方式', trigger: 'change' }],
  mode: [{ required: true, message: '请选择传输模式', trigger: 'change' }],
}

function resetForm() {
  form.port = undefined
  form.password = ''
  form.method = ''
  form.noDelay = false
  form.plugin = ''
  form.pluginOpts = ''
  form.pluginMode = ''
  form.mode = ''
}

function fillForm(server: ServerInfo) {
  form.port = server.port
  form.password = server.password ?? ''
  form.method = server.method ?? ''
  form.noDelay = server.noDelay ?? false
  form.plugin = server.plugin ?? ''
  form.pluginOpts = server.pluginOpts ?? ''
  form.pluginMode = server.pluginMode ?? ''
  form.mode = server.mode ?? ''
}

// 每次打开抽屉时按模式重置表单或回填编辑数据
watch(visible, (open) => {
  if (!open) return

  if (props.server) {
    fillForm(props.server)
    originalPort.value = props.server.port
  } else {
    resetForm()
    originalPort.value = null
  }
  void nextTick(() => formRef.value?.clearValidate())
})

// 清空插件后不再保留插件相关参数
watch(
  () => form.plugin,
  (plugin) => {
    if (!plugin.trim()) {
      form.pluginOpts = ''
      form.pluginMode = ''
    }
  },
)

function generateMainPassword() {
  form.password = randomBase64(keyLengthForMethod(form.method))
}

function buildPayload(): AddServerPayload {
  const payload: AddServerPayload = {
    port: form.port as number,
    password: form.password,
  }

  if (form.method) payload.method = form.method
  if (form.noDelay) payload.noDelay = true

  const plugin = form.plugin.trim()
  if (plugin) {
    payload.plugin = plugin
    if (form.pluginOpts.trim()) payload.pluginOpts = form.pluginOpts.trim()
    if (form.pluginMode) payload.pluginMode = form.pluginMode
  }

  if (form.mode) payload.mode = form.mode

  return payload
}

async function handleSubmit() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return
  if (form.port === undefined) return

  submitting.value = true
  const endLoading = globalLoadingStart(
    isEdit.value ? '保存服务器中...' : '添加服务器中...',
  )
  try {
    const payload = buildPayload()
    if (isEdit.value && originalPort.value !== null) {
      await serversApi.update(originalPort.value, payload)
      ElMessage.success(`服务器已更新，端口 ${payload.port}`)
    } else {
      await serversApi.add(payload)
      ElMessage.success(`服务器已添加，端口 ${payload.port}`)
    }
    emit('success')
    visible.value = false
  } catch {
    // 失败提示（如端口已被占用）已由 axios 拦截器统一处理，抽屉保持打开
  } finally {
    submitting.value = false
    endLoading()
  }
}
</script>

<template>
  <el-drawer
    v-model="visible"
    class="server-form-drawer"
    direction="rtl"
    size="620px"
    :title="title"
    destroy-on-close
  >
    <el-alert
      v-if="isEdit && props.server?.configKnown === false"
      class="config-known-alert"
      type="warning"
      :closable="false"
      show-icon
      title="该服务器不是由本面板创建，ssmanager 无法回显加密方式、插件和传输模式，请按需重新填写。"
    />
    <el-form ref="formRef" :model="form" :rules="rules" label-width="100px">
      <el-divider content-position="left">基础配置</el-divider>
      <el-form-item label="端口" prop="port">
        <el-input-number
          v-model="form.port"
          :min="1"
          :max="65535"
          :precision="0"
          :controls="false"
          placeholder="1 - 65535"
          class="full-width"
        />
      </el-form-item>
      <el-form-item label="密码" prop="password">
        <div class="password-with-action">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="
              is2022Method(form.method)
                ? 'Base64 密钥，可手动粘贴或点击生成'
                : '请输入连接密码'
            "
          />
          <el-button v-if="is2022Method(form.method)" @click="generateMainPassword">生成</el-button>
        </div>
      </el-form-item>

      <el-divider content-position="left">高级配置</el-divider>
      <el-form-item label="加密方式" prop="method">
        <el-select
          v-model="form.method"
          filterable
          allow-create
          placeholder="请选择加密方式"
          class="full-width"
        >
          <el-option v-for="item in METHOD_OPTIONS" :key="item" :label="item" :value="item" />
        </el-select>
        <div class="form-tip">请选择加密方式</div>
      </el-form-item>
      <el-form-item label="无延迟" prop="noDelay">
        <el-switch v-model="form.noDelay" />
      </el-form-item>
      <el-form-item label="插件" prop="plugin">
        <el-input v-model="form.plugin" clearable placeholder="如 obfs-local" />
      </el-form-item>
      <el-form-item v-if="form.plugin.trim()" label="插件参数" prop="pluginOpts">
        <el-input v-model="form.pluginOpts" clearable placeholder="如 obfs=http" />
      </el-form-item>
      <el-form-item v-if="form.plugin.trim()" label="插件模式" prop="pluginMode">
        <el-select v-model="form.pluginMode" clearable placeholder="选择插件模式" class="full-width">
          <el-option v-for="item in TRANSPORT_OPTIONS" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
      <el-form-item label="传输模式" prop="mode">
        <el-select v-model="form.mode" placeholder="请选择传输模式" class="full-width">
          <el-option v-for="item in TRANSPORT_OPTIONS" :key="item" :label="item" :value="item" />
        </el-select>
      </el-form-item>
    </el-form>
    <template #footer>
      <div class="drawer-footer">
        <el-button @click="visible = false">取消</el-button>
        <el-button type="primary" :disabled="submitting" @click="handleSubmit">确定</el-button>
      </div>
    </template>
  </el-drawer>
</template>

<style scoped>
.full-width {
  width: 100%;
}

.form-tip {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-secondary);
}

.password-with-action {
  display: flex;
  gap: 8px;
  width: 100%;
}

.password-with-action :deep(.el-input) {
  flex: 1;
  min-width: 0;
}

.config-known-alert {
  margin-bottom: 12px;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.server-form-drawer :deep(.el-drawer__body) {
  padding-top: 8px;
}

.server-form-drawer :deep(.el-divider) {
  margin: 4px 0 16px;
}

.server-form-drawer :deep(.el-divider__text) {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
</style>
