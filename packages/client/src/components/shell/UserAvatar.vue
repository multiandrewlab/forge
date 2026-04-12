<!-- packages/client/src/components/shell/UserAvatar.vue -->
<template>
  <div class="relative">
    <button class="flex items-center gap-2 rounded-lg p-2 hover:bg-gray-700" @click="open = !open">
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-white"
      >
        {{ initials }}
      </div>
      <span v-if="!collapsed" class="text-sm text-gray-300">{{ user?.displayName }}</span>
    </button>
    <div
      v-if="open"
      class="absolute bottom-full left-0 mb-2 w-48 rounded-lg border border-gray-600 bg-gray-800 py-1 shadow-lg"
    >
      <button
        v-for="item in menuItems"
        :key="item.label"
        class="block w-full px-4 py-2 text-left text-sm text-gray-300 hover:bg-gray-700"
        @click="
          item.action();
          open = false;
        "
      >
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../../composables/useAuth.js';

defineProps<{ collapsed?: boolean }>();

const { user, logout } = useAuth();
const router = useRouter();
const open = ref(false);

const initials = computed(() => {
  const name = user.value?.displayName ?? '';
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});

const menuItems = [
  { label: 'Profile', action: () => {} }, // TODO: profile page
  { label: 'My Snippets', action: () => router.push('/my-snippets') },
  { label: 'Settings', action: () => {} }, // TODO: settings page
  { label: 'Logout', action: () => logout().then(() => router.push('/login')) },
];
</script>
