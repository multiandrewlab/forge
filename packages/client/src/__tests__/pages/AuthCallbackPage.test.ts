import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { AuthProvider } from '@forge/shared';
import type { User } from '@forge/shared';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

import AuthCallbackPage from '@/pages/AuthCallbackPage.vue';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    authProvider: AuthProvider.Google,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/auth/callback', name: 'auth-callback', component: AuthCallbackPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  });
}

describe('AuthCallbackPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockApiFetch.mockReset();
  });

  async function mountCallback(hash: string) {
    router.push({ path: '/auth/callback', hash });
    await router.isReady();

    const wrapper = mount(AuthCallbackPage, {
      global: {
        plugins: [pinia, router],
      },
    });

    await flushPromises();
    return wrapper;
  }

  describe('token parsing and auth flow', () => {
    it('should show loading state initially', async () => {
      // Make the fetch hang so we can see loading state
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      router.push({ path: '/auth/callback', hash: '#access_token=test-token' });
      await router.isReady();

      const wrapper = mount(AuthCallbackPage, {
        global: {
          plugins: [pinia, router],
        },
      });

      expect(wrapper.text()).toContain('Loading');
    });

    it('should parse access_token from URL hash and call /api/auth/me', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 }));

      await mountCallback('#access_token=my-jwt-token');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', {
        headers: { Authorization: 'Bearer my-jwt-token' },
      });
    });

    it('should store token and user in auth store on success', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 }));

      await mountCallback('#access_token=my-jwt-token');

      const store = useAuthStore();
      expect(store.accessToken).toBe('my-jwt-token');
      expect(store.user).toEqual(JSON.parse(JSON.stringify(mockUser)));
    });

    it('should redirect to "/" on success', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockUser), { status: 200 }));

      await mountCallback('#access_token=my-jwt-token');

      expect(router.currentRoute.value.path).toBe('/');
    });
  });

  describe('error handling', () => {
    it('should redirect to /login when no access_token in hash', async () => {
      await mountCallback('');

      expect(router.currentRoute.value.path).toBe('/login');
    });

    it('should redirect to /login when /api/auth/me returns error', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 }),
      );

      await mountCallback('#access_token=bad-token');

      expect(router.currentRoute.value.path).toBe('/login');
    });

    it('should redirect to /login when fetch throws a network error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      await mountCallback('#access_token=some-token');

      expect(router.currentRoute.value.path).toBe('/login');
    });
  });
});
