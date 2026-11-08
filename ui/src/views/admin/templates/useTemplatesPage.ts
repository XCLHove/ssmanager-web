import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { adminApi, type TemplateLibraryItem } from '@/api'
import { globalLoadingStart } from '@/utils/loading'

export interface TemplateLibraryForm {
  name: string
  code: string
  format: string
}

export function useTemplatesPage() {
  const items = ref<TemplateLibraryItem[]>([])
  const dialogVisible = ref(false)
  const editingId = ref<number | null>(null)
  const saving = ref(false)
  const form = ref<TemplateLibraryForm>({
    name: '',
    code: '',
    format: 'clash',
  })

  const dialogTitle = computed(() => (editingId.value === null ? '新建模板' : '编辑模板'))

  function formatTime(value?: number | null): string {
    return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '-'
  }

  async function loadList() {
    const endLoading = globalLoadingStart('加载模板库...')
    try {
      const res = await adminApi.templateLibrary.list()
      items.value = res.items
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  function openCreate() {
    editingId.value = null
    form.value = { name: '', code: '', format: 'clash' }
    dialogVisible.value = true
  }

  async function openEdit(item: TemplateLibraryItem) {
    const endLoading = globalLoadingStart('加载模板...')
    try {
      const detail = await adminApi.templateLibrary.get(item.id)
      editingId.value = detail.id
      form.value = {
        name: detail.name,
        code: detail.code,
        format: detail.format || 'clash',
      }
      dialogVisible.value = true
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  async function handleSave() {
    if (saving.value) return
    const name = form.value.name.trim()
    if (!name) {
      ElMessage.warning('请输入模板名称')
      return
    }
    if (!form.value.code.trim()) {
      ElMessage.warning('请输入模板代码')
      return
    }

    saving.value = true
    const endLoading = globalLoadingStart('保存模板中...')
    try {
      if (editingId.value === null) {
        await adminApi.templateLibrary.create(name, form.value.code, form.value.format)
        ElMessage.success('模板已创建')
      } else {
        await adminApi.templateLibrary.update(
          editingId.value,
          name,
          form.value.code,
          form.value.format,
        )
        ElMessage.success('模板已保存')
      }
      dialogVisible.value = false
      await loadList()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      saving.value = false
      endLoading()
    }
  }

  async function handleRemove(item: TemplateLibraryItem) {
    try {
      await ElMessageBox.confirm(
        `确定删除模板「${item.name}」吗？已复制到服务器的代码不会受影响。`,
        '删除模板',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' },
      )
    } catch {
      return
    }

    const endLoading = globalLoadingStart('删除模板中...')
    try {
      await adminApi.templateLibrary.remove(item.id)
      ElMessage.success('模板已删除')
      await loadList()
    } catch {
      // 错误提示已由 axios 拦截器统一处理
    } finally {
      endLoading()
    }
  }

  onMounted(() => {
    void loadList()
  })

  return {
    items,
    dialogVisible,
    editingId,
    saving,
    form,
    dialogTitle,
    formatTime,
    loadList,
    openCreate,
    openEdit,
    handleSave,
    handleRemove,
  }
}
