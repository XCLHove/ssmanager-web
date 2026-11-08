<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import TemplatesDesktop from './templates/TemplatesDesktop.vue'
import TemplatesMobile from './templates/TemplatesMobile.vue'

const isMobile = useIsMobile()
</script>

<template>
  <TemplatesMobile v-if="isMobile" />
  <TemplatesDesktop v-else />
</template>
