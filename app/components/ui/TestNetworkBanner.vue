<script setup lang="ts">
import { TriangleAlert } from "lucide-vue-next";
</script>

<template>
  <div class="test-network-banner bg-status-warning text-fg-warning text-label-m" role="note">
    <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
    <span>Test network: balances and tokens here have no real value. Don't send real assets.</span>
  </div>
</template>

<style scoped>
.test-network-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  padding-top: calc(0.5rem + env(safe-area-inset-top, 0px));
}
</style>
