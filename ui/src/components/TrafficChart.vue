<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ECharts, EChartsCoreOption } from 'echarts/core'
import type { TrafficHistorySample } from '@/api'

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])

const props = defineProps<{ samples: TrafficHistorySample[] }>()

const container = ref<HTMLDivElement>()
let chart: ECharts | null = null
let resizeObserver: ResizeObserver | null = null

function formatRate(value: number): string {
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let rate = value
  let index = 0
  while (rate >= 1024 && index < units.length - 1) {
    rate /= 1024
    index += 1
  }
  return index === 0 ? `${Math.round(rate)} ${units[index]}` : `${rate.toFixed(2)} ${units[index]}`
}

function formatTime(t: number): string {
  return new Date(t).toLocaleTimeString('zh-CN', { hour12: false })
}

function buildOption(samples: TrafficHistorySample[]): EChartsCoreOption {
  return {
    animation: false,
    grid: { left: 70, right: 24, top: 28, bottom: 44 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = Array.isArray(params) ? params : [params]
        const first = list[0] as { axisValue?: string; value?: number } | undefined
        return `${first?.axisValue ?? ''}<br/>合计速率：${formatRate(Number(first?.value ?? 0))}`
      },
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: samples.map((sample) => formatTime(sample.t)),
      axisLabel: { color: '#909399' },
    },
    yAxis: {
      type: 'value',
      name: 'bytes/s',
      axisLabel: {
        color: '#909399',
        formatter: (value: number) => formatRate(value),
      },
      splitLine: { lineStyle: { color: '#ebeef5' } },
    },
    series: [
      {
        name: '合计速率',
        type: 'line',
        data: samples.map((sample) => (sample.reset ? 0 : sample.rate)),
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: '#409eff' },
        itemStyle: { color: '#409eff' },
        areaStyle: { opacity: 0.15, color: '#409eff' },
      },
    ],
  }
}

function handleResize() {
  chart?.resize()
}

onMounted(() => {
  if (!container.value) return
  chart = echarts.init(container.value)
  chart.setOption(buildOption(props.samples))
  window.addEventListener('resize', handleResize)

  // 布局切换（如移动端媒体查询改变图表高度）不会触发 window resize，监听容器尺寸
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(container.value)
  }
})

watch(
  () => props.samples,
  (samples) => {
    chart?.setOption(buildOption(samples), { notMerge: true })
  },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="container" class="traffic-chart"></div>
</template>

<style scoped>
.traffic-chart {
  width: 100%;
  height: 320px;
}

@media (max-width: 768px) {
  .traffic-chart {
    height: 240px;
  }
}
</style>
