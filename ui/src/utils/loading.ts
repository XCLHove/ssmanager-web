import { ElLoading } from "element-plus";
import { computed, ref } from "vue";

export function createLoading() {
    let loadingIndex = 0
    let loadingInfoList: { text: string; index: number }[] = []
    let loadingListener: ((loadingTextList: string[]) => void)[] = []

    const getIndex = () => {
        const index = loadingIndex
        loadingIndex++
        return index
    }

    const loadingStart = (text?: string) => {
        text = text || "加载中..."
        const index = getIndex()
        loadingInfoList.push({ text, index })
        updateLoading()

        const loadingEnd = () => {
            loadingInfoList = loadingInfoList.filter(item => item.index !== index)
            updateLoading()
        }
        return loadingEnd
    }

    const updateLoading = () => {
        const loadingTextList = loadingInfoList.map(item => item.text)
        loadingListener.forEach(callback => callback([...loadingTextList]))
    }

    const onLoadingChange = (callback: (loadingTextList: string[]) => void) => {
        loadingListener.push(callback)
        const removeCallback = () => {
            loadingListener = loadingListener.filter(item => item !== callback)
        }
        return removeCallback
    }

    return {
        loadingStart,
        onLoadingChange,
    }
}

const globalLoading = createLoading()
/**
 * @example 
 * getUserApi().finally(globalLoadingStart('获取用户...'))
 * 
 */
const globalLoadingStart = globalLoading.loadingStart
let elLoadingInstance: ReturnType<typeof ElLoading.service> | null = null
let globalLoadingTextList = ref<string[]>([])
let globalLoadingText = ref<string>('')
globalLoading.onLoadingChange((loadingTextList) => {
    globalLoadingTextList.value = [...loadingTextList]
    if (loadingTextList.length > 0) {
        const text = loadingTextList[loadingTextList.length - 1] as string
        globalLoadingText.value = text
        elLoadingInstance ||= ElLoading.service({ text })
        elLoadingInstance.setText(text)
    } else {
        elLoadingInstance?.close()
        elLoadingInstance = null
    }
})
export function useGlobalLoadingData() {
    return {
        globalLoadingText,
        globalLoadingTextList,
        globalLoadingVisible: computed(() => globalLoadingTextList.value.length > 0)
    }
}
export { globalLoadingStart }

export function useLoading() {
    const loadingTextList = ref<string[]>([])
    const loadingVisible = computed(() => loadingTextList.value.length > 0)
    const loadingText = computed(() => loadingTextList.value[loadingTextList.value.length - 1] || "")
    const { loadingStart, onLoadingChange } = createLoading()
    onLoadingChange((list) => {
        loadingTextList.value = list
    })
    return {
        loadingStart,
        loadingVisible,
        loadingText,
        loadingTextList
    }
}