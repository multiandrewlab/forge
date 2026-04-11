import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { User } from '@forge/shared';

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref<string | null>(null);
  const user = ref<User | null>(null);

  const isAuthenticated = computed(() => accessToken.value !== null && user.value !== null);

  function setAuth(token: string, userData: User): void {
    accessToken.value = token;
    user.value = userData;
  }

  function clearAuth(): void {
    accessToken.value = null;
    user.value = null;
  }

  function setUser(userData: User | null): void {
    user.value = userData;
  }

  return {
    accessToken,
    user,
    isAuthenticated,
    setAuth,
    clearAuth,
    setUser,
  };
});
