<script setup lang="ts">
import { useIsMobile } from '@/composables/useIsMobile'
import UsersDesktop from './users/UsersDesktop.vue'
import UsersMobile from './users/UsersMobile.vue'

const isMobile = useIsMobile()
</script>

<template>
  <UsersMobile v-if="isMobile" />
  <UsersDesktop v-else />
</template>
