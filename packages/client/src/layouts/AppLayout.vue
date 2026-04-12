<!-- packages/client/src/layouts/AppLayout.vue -->
<template>
  <div class="flex h-screen flex-col bg-surface text-gray-200">
    <TheTopBar :sidebar-collapsed="sidebarCollapsed" @toggle-sidebar="handleToggleSidebar" />
    <div class="flex flex-1 overflow-hidden">
      <TheSidebar
        :collapsed="sidebarCollapsed"
        :overlay-open="overlayOpen"
        @close-overlay="overlayOpen = false"
      />
      <main class="flex-1 overflow-hidden">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RouterView } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useUiStore } from '../stores/ui.js';
import TheSidebar from '../components/shell/TheSidebar.vue';
import TheTopBar from '../components/shell/TheTopBar.vue';

const uiStore = useUiStore();
const { sidebarCollapsed } = storeToRefs(uiStore);
const overlayOpen = ref(false);

declare const window: { innerWidth: number };

function handleToggleSidebar(): void {
  // On mobile: toggle overlay; on desktop: toggle collapse
  if (window.innerWidth < 768) {
    overlayOpen.value = !overlayOpen.value;
  } else {
    uiStore.toggleSidebar();
  }
}
</script>
