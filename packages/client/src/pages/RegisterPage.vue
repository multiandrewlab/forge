<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';
import { registerSchema } from '@forge/shared';

const router = useRouter();
const { register, error } = useAuth();

const email = ref('');
const displayName = ref('');
const password = ref('');
const confirmPassword = ref('');
const validationError = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
  validationError.value = null;

  const formData = {
    email: email.value,
    display_name: displayName.value,
    password: password.value,
    confirm_password: confirmPassword.value,
  };

  const result = registerSchema.safeParse(formData);

  if (!result.success) {
    validationError.value = result.error.errors.map((e) => e.message).join(', ');
    return;
  }

  await register(formData);

  if (!error.value) {
    await router.push('/');
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-surface">
    <div class="w-full max-w-md p-8">
      <h1 class="text-3xl font-bold text-center mb-8">Create Account</h1>

      <div
        v-if="error"
        data-testid="error-message"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ error }}
      </div>

      <div
        v-if="validationError"
        data-testid="validation-error"
        class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
      >
        {{ validationError }}
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
          <label for="display-name" class="block text-sm font-medium mb-1">Display Name</label>
          <input
            id="display-name"
            v-model="displayName"
            data-testid="display-name"
            type="text"
            required
            class="w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label for="password" class="block text-sm font-medium mb-1">Password</label>
          <input
            id="password"
            v-model="password"
            data-testid="password"
            type="password"
            required
            class="w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label for="confirm-password" class="block text-sm font-medium mb-1"
            >Confirm Password</label
          >
          <input
            id="confirm-password"
            v-model="confirmPassword"
            data-testid="confirm-password"
            type="password"
            required
            class="w-full px-3 py-2 bg-surface-700 border border-surface-500 rounded focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <button
          type="submit"
          class="w-full py-2 bg-primary text-white rounded hover:bg-primary-600 font-medium"
        >
          Create Account
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-400">
        Already have an account?
        <a href="/login" class="text-primary hover:underline">Sign in</a>
      </p>
    </div>
  </div>
</template>
