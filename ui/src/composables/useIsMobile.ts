import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

const MOBILE_QUERY = '(max-width: 768px)'

/**
 * 基于媒体查询判断是否为移动端布局（宽度 <= 768px）。
 * 初始值同步读取，组件挂载后监听视口变化，卸载时移除监听。
 */
export function useIsMobile(): Ref<boolean> {
  const mql = window.matchMedia(MOBILE_QUERY)
  const isMobile = ref(mql.matches)

  const handleChange = (event: MediaQueryListEvent) => {
    isMobile.value = event.matches
  }

  onMounted(() => {
    mql.addEventListener('change', handleChange)
  })

  onBeforeUnmount(() => {
    mql.removeEventListener('change', handleChange)
  })

  return isMobile
}
