<script setup lang="ts">
import { TriangleAlert } from "lucide-vue-next";
</script>

<template>
  <!-- Pinned above every screen; useVisualViewportHeight lays the screens out below it. -->
  <div
    data-test-network-banner
    class="test-network-banner bg-status-warning text-label-m"
    role="note"
  >
    <TriangleAlert class="size-4 shrink-0" aria-hidden="true" />
    <span>Test network: balances and tokens here have no real value. Don't send real assets.</span>
  </div>
</template>

<style scoped>
.test-network-banner {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  z-index: 40;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  /* The warning fill is amber in every theme; no foreground token pairs with it. */
  color: var(--palette-neutral-900);
}
</style>
