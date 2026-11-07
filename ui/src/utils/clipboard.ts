import { ElMessage } from 'element-plus'

/** 复制文本，优先 Clipboard API，失败时回退 execCommand（兼容局域网 http） */
export async function copyText(text: string): Promise<void> {
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
