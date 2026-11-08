<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import ServersDesktop from './servers/ServersDesktop.vue'
import ServersMobile from './servers/ServersMobile.vue'

const isMobile = useIsMobile()
</script>

<template>
  <ServersMobile v-if="isMobile" />
  <ServersDesktop v-else />
</template>
