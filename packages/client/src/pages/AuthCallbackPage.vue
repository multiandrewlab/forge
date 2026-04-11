<script setup lang="ts">
/* global URLSearchParams */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/api';
import type { User } from '@forge/shared';

const route = useRoute();
const router = useRouter();
const store = useAuthStore();
const loading = ref(true);

onMounted(async () => {
  const hash = route.hash;
  const params = new URLSearchParams(hash.replace('#', ''));
  const accessToken = params.get('access_token');

  if (!accessToken) {
    await router.push({ name: 'login' });
    return;
  }

  try {
    const response = await apiFetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      await router.push({ name: 'login' });
      return;
    }

    const user = (await response.json()) as User;
    store.setAuth(accessToken, user);
    await router.push({ name: 'home' });
  } catch {
    await router.push({ name: 'login' });
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div v-if="loading" class="text-center">
      <p class="text-lg text-gray-400">Loading...</p>
    </div>
  </div>
</template>
