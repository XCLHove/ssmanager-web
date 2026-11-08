<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import CodesDesktop from './codes/CodesDesktop.vue'
import CodesMobile from './codes/CodesMobile.vue'

const isMobile = useIsMobile()
</script>

<template>
  <CodesMobile v-if="isMobile" />
  <CodesDesktop v-else />
</template>
