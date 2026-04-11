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

import AccountLinkPage from '@/pages/AccountLinkPage.vue';

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
      { path: '/auth/link', name: 'auth-link', component: AccountLinkPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  });
}

describe('AccountLinkPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockApiFetch.mockReset();
  });

  async function mountAccountLink(hash: string) {
    router.push({ path: '/auth/link', hash });
    await router.isReady();

    return mount(AccountLinkPage, {
      global: {
        plugins: [pinia, router],
      },
    });
  }

  describe('rendering', () => {
    it('should render explanation message', async () => {
      const wrapper = await mountAccountLink('#link_token=test-link-token');
      expect(wrapper.text()).toContain('link');
    });

    it('should render password input', async () => {
      const wrapper = await mountAccountLink('#link_token=test-link-token');
      const passwordInput = wrapper.find('input[type="password"]');
      expect(passwordInput.exists()).toBe(true);
    });

    it('should render a "Link Account" submit button', async () => {
      const wrapper = await mountAccountLink('#link_token=test-link-token');
      const button = wrapper.find('button[type="submit"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toContain('Link');
    });

    it('should render a "Cancel" link', async () => {
      const wrapper = await mountAccountLink('#link_token=test-link-token');
      const cancelLink = wrapper.find('a[href="/login"]');
      expect(cancelLink.exists()).toBe(true);
      expect(cancelLink.text()).toContain('Cancel');
    });
  });

  describe('form submission', () => {
    it('should POST to /api/auth/link-google with link_token and password', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: mockUser, accessToken: 'linked-token' }), {
          status: 200,
        }),
      );

      const wrapper = await mountAccountLink('#link_token=my-link-token');

      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/link-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link_token: 'my-link-token', password: 'password123' }),
      });
    });

    it('should store tokens and redirect to "/" on success', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: mockUser, accessToken: 'linked-token' }), {
          status: 200,
        }),
      );

      const wrapper = await mountAccountLink('#link_token=my-link-token');

      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      const store = useAuthStore();
      expect(store.accessToken).toBe('linked-token');
      expect(store.user).toEqual(JSON.parse(JSON.stringify(mockUser)));
      expect(router.currentRoute.value.path).toBe('/');
    });

    it('should show error on wrong password', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid password' }), { status: 401 }),
      );

      const wrapper = await mountAccountLink('#link_token=my-link-token');

      await wrapper.find('input[type="password"]').setValue('wrong');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.text()).toContain('Invalid password');
    });

    it('should show generic error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const wrapper = await mountAccountLink('#link_token=my-link-token');

      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.text()).toContain('Linking failed');
    });

    it('should show generic error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'Something went wrong' }), { status: 400 }),
      );

      const wrapper = await mountAccountLink('#link_token=my-link-token');

      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(wrapper.text()).toContain('Linking failed');
    });

    it('should redirect to /login on expired token', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Token expired' }), { status: 410 }),
      );

      const wrapper = await mountAccountLink('#link_token=expired-token');

      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/login');
    });
  });

  describe('missing link_token', () => {
    it('should redirect to /login when no link_token in hash', async () => {
      await mountAccountLink('');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/login');
    });
  });
});
