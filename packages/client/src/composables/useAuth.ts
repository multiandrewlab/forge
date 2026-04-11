import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { apiFetch } from '@/lib/api';
import type { User, RegisterInput, UpdateProfileInput } from '@forge/shared';

interface AuthResponse {
  user: User;
  accessToken: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function useAuth() {
  const store = useAuthStore();
  const { user } = storeToRefs(store);
  const isAuthenticated = computed(() => store.isAuthenticated);
  const error = ref<string | null>(null);

  async function login(email: string, password: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Login failed');
        return;
      }

      const data = (await response.json()) as AuthResponse;
      store.setAuth(data.accessToken, data.user);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Login failed';
    }
  }

  async function register(data: RegisterInput): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Registration failed');
        return;
      }

      const result = (await response.json()) as AuthResponse;
      store.setAuth(result.accessToken, result.user);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Registration failed';
    }
  }

  async function logout(): Promise<void> {
    try {
      await apiFetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Clear store regardless of request outcome
    } finally {
      store.clearAuth();
    }
  }

  async function refresh(): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Token refresh failed');
        return;
      }

      const data = (await response.json()) as { accessToken: string };
      store.$patch({ accessToken: data.accessToken });
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Token refresh failed';
    }
  }

  async function fetchUser(): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch('/api/auth/me', {
        credentials: 'include',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to fetch user');
        return;
      }

      const data = (await response.json()) as User;
      store.setUser(data);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch user';
    }
  }

  async function updateProfile(data: UpdateProfileInput): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Profile update failed');
        return;
      }

      const updatedUser = (await response.json()) as User;
      store.setUser(updatedUser);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Profile update failed';
    }
  }

  return {
    user,
    isAuthenticated,
    error,
    login,
    register,
    logout,
    refresh,
    fetchUser,
    updateProfile,
  };
}
