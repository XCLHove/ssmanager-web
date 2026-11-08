<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import MyServersDesktop from './my-servers/MyServersDesktop.vue'
import MyServersMobile from './my-servers/MyServersMobile.vue'

const isMobile = useIsMobile()
</script>

<template>
  <MyServersMobile v-if="isMobile" />
  <MyServersDesktop v-else />
</template>
