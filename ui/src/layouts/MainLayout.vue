<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import DesktopLayout from './desktop/DesktopLayout.vue'
import MobileLayout from './mobile/MobileLayout.vue'

const isMobile = useIsMobile()
</script>

<template>
  <MobileLayout v-if="isMobile" />
  <DesktopLayout v-else />
</template>
