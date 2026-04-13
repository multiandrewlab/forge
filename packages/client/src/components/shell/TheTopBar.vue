<!-- packages/client/src/components/shell/TheTopBar.vue -->
<template>
  <header class="flex h-14 shrink-0 items-center gap-4 border-b border-gray-700 bg-surface px-4">
    <button
      class="text-gray-400 hover:text-white lg:hidden"
      aria-label="Toggle sidebar"
      @click="$emit('toggleSidebar')"
    >
      <svg class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M4 6h16M4 12h16M4 18h16"
        />
      </svg>
    </button>
    <div class="flex items-center gap-2">
      <span class="text-lg font-bold text-primary">Forge</span>
    </div>
    <div class="relative mx-4 flex-1">
      <button
        data-testid="search-trigger"
        class="flex w-full max-w-md items-center justify-between rounded-lg border border-gray-600 bg-gray-800 px-4 py-1.5 text-sm text-gray-400 hover:border-gray-500 focus:outline-none"
        @click="searchStore.open()"
      >
        <span>Search...</span>
        <kbd
          class="ml-2 rounded border border-gray-600 bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400"
          >Cmd+K</kbd
        >
      </button>
    </div>
    <button class="text-gray-400 hover:text-white" aria-label="Toggle dark mode" @click="toggle">
      <svg v-if="darkMode" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
        />
      </svg>
      <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
        />
      </svg>
    </button>
  </header>
</template>

<script setup lang="ts">
import { useDarkMode } from '../../composables/useDarkMode.js';
import { useSearchStore } from '../../stores/search.js';
import { useKeyboard } from '../../composables/useKeyboard.js';

defineProps<{ sidebarCollapsed: boolean }>();
defineEmits<{ toggleSidebar: [] }>();

const { darkMode, toggle } = useDarkMode();
const searchStore = useSearchStore();
const { register } = useKeyboard();

register('mod+k', () => searchStore.open());
</script>
