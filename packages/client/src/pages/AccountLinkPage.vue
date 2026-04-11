<script setup lang="ts">
/* global URLSearchParams */
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/api';
import type { User } from '@forge/shared';

interface LinkResponse {
  user: User;
  accessToken: string;
}

const route = useRoute();
const router = useRouter();
const store = useAuthStore();

const linkToken = ref('');
const password = ref('');
const error = ref<string | null>(null);
const ready = ref(false);

onMounted(() => {
  const hash = route.hash;
  const params = new URLSearchParams(hash.replace('#', ''));
  const token = params.get('link_token');

  if (!token) {
    void router.push({ name: 'login' });
    return;
  }

  linkToken.value = token;
  ready.value = true;
});

async function handleSubmit(): Promise<void> {
  error.value = null;

  try {
    const response = await apiFetch('/api/auth/link-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ link_token: linkToken.value, password: password.value }),
    });

    if (!response.ok) {
      const data = (await response.json()) as { error?: string };
      const message = data.error ?? 'Linking failed';

      if (response.status === 410) {
        await router.push({ name: 'login' });
        return;
      }

      error.value = message;
      return;
    }

    const data = (await response.json()) as LinkResponse;
    store.setAuth(data.accessToken, data.user);
    await router.push({ name: 'home' });
  } catch {
    error.value = 'Linking failed';
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div v-if="ready" class="w-full max-w-md p-8">
      <h1 class="text-3xl font-bold text-center mb-4">Link Your Account</h1>

      <p class="text-gray-400 text-center mb-8">
        An account with this email already exists. Enter your password to link your Google account.
      </p>

      <div
        v-if="error"
        data-testid="error-message"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="password" class="block text-sm font-medium mb-1">Password</label>
          <input
            id="password"
            v-model="password"
            type="password"
            required
            class="w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          class="w-full py-2 bg-primary text-white rounded hover:bg-primary-600 font-medium"
        >
          Link Account
        </button>
      </form>

      <p class="mt-6 text-center">
        <a href="/login" class="text-gray-400 hover:underline">Cancel</a>
      </p>
    </div>
  </div>
</template>
