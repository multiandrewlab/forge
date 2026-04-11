<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const route = useRoute();
const { login, error } = useAuth();

const email = ref('');
const password = ref('');

async function handleSubmit(): Promise<void> {
  await login(email.value, password.value);

  if (!error.value) {
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    await router.push(redirect);
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div class="w-full max-w-md p-8">
      <h1 class="text-3xl font-bold text-center mb-8">Sign In</h1>

      <div
        v-if="error"
        data-testid="error-message"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <form class="space-y-4" @submit.prevent="handleSubmit">
        <div>
          <label for="email" class="block text-sm font-medium mb-1">Email</label>
          <input
            id="email"
            v-model="email"
            type="email"
            required
            class="w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

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
          Sign In
        </button>
      </form>

      <div class="mt-6 text-center">
        <a
          href="/api/auth/google"
          class="inline-block w-full py-2 border border-surface-500 rounded text-center hover:bg-surface-700"
        >
          Sign in with Google
        </a>
      </div>

      <p class="mt-6 text-center text-sm text-gray-400">
        Don't have an account?
        <a href="/register" class="text-primary hover:underline">Register</a>
      </p>
    </div>
  </div>
</template>
