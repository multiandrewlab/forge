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
    <TheSearchModal />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue';
import { RouterView } from 'vue-router';
import { storeToRefs } from 'pinia';
import { useUiStore } from '../stores/ui.js';
import { useAuthStore } from '../stores/auth.js';
import { useWebSocket } from '../composables/useWebSocket.js';
import { useFeed } from '../composables/useFeed.js';
import TheSidebar from '../components/shell/TheSidebar.vue';
import TheTopBar from '../components/shell/TheTopBar.vue';
import TheSearchModal from '../components/shell/TheSearchModal.vue';

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

// ── WebSocket lifecycle tied to auth state ──────────────────────────────
const authStore = useAuthStore();
const ws = useWebSocket();
const feed = useFeed();

let feedCleanup: (() => void) | null = null;

watch(
  () => authStore.isAuthenticated,
  (isAuth) => {
    if (isAuth) {
      ws.connect(() => Promise.resolve(authStore.accessToken ?? ''));
      feedCleanup = feed.subscribeRealtime();
    } else {
      if (feedCleanup) {
        feedCleanup();
        feedCleanup = null;
      }
      ws.disconnect();
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (feedCleanup) {
    feedCleanup();
    feedCleanup = null;
  }
  ws.disconnect();
});
</script>
