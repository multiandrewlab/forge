import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';

// Mock useAuth composable
const mockLogin = vi.fn();
const mockError: Ref<string | null> = ref(null);

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    login: mockLogin,
    error: mockError,
  }),
}));

import LoginPage from '@/pages/LoginPage.vue';

function createTestRouter(): Router {
  const routes = [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/login', name: 'login', component: LoginPage },
    { path: '/register', name: 'register', component: { template: '<div>Register</div>' } },
  ];

  const router = createRouter({
    history: createMemoryHistory(),
    routes,
  });

  return router;
}

describe('LoginPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockLogin.mockReset();
    mockError.value = null; // ref.value assignment
  });

  async function mountLoginPage(query: Record<string, string> = {}) {
    router.push({ path: '/login', query });
    await router.isReady();

    return mount(LoginPage, {
      global: {
        plugins: [pinia, router],
      },
    });
  }

  describe('rendering', () => {
    it('should render email input', async () => {
      const wrapper = await mountLoginPage();
      const emailInput = wrapper.find('input[type="email"]');
      expect(emailInput.exists()).toBe(true);
    });

    it('should render password input', async () => {
      const wrapper = await mountLoginPage();
      const passwordInput = wrapper.find('input[type="password"]');
      expect(passwordInput.exists()).toBe(true);
    });

    it('should render a submit button', async () => {
      const wrapper = await mountLoginPage();
      const button = wrapper.find('button[type="submit"]');
      expect(button.exists()).toBe(true);
    });

    it('should render a "Sign in with Google" link', async () => {
      const wrapper = await mountLoginPage();
      const googleLink = wrapper.find('a[href="/api/auth/google"]');
      expect(googleLink.exists()).toBe(true);
      expect(googleLink.text()).toContain('Google');
    });

    it('should render a link to the register page', async () => {
      const wrapper = await mountLoginPage();
      const registerLink = wrapper.find('a[href="/register"]');
      expect(registerLink.exists()).toBe(true);
    });
  });

  describe('form submission', () => {
    it('should call login with email and password on submit', async () => {
      mockLogin.mockResolvedValue(undefined);
      const wrapper = await mountLoginPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'password123');
    });

    it('should redirect to "/" on successful login', async () => {
      mockLogin.mockImplementation(() => {
        // Simulate successful login — no error set
        mockError.value = null;
        return Promise.resolve();
      });

      const wrapper = await mountLoginPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/');
    });

    it('should redirect to route.query.redirect on successful login', async () => {
      const targetRouter = createRouter({
        history: createMemoryHistory(),
        routes: [
          { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
          { path: '/login', name: 'login', component: LoginPage },
          {
            path: '/dashboard',
            name: 'dashboard',
            component: { template: '<div>Dashboard</div>' },
          },
        ],
      });

      targetRouter.push({ path: '/login', query: { redirect: '/dashboard' } });
      await targetRouter.isReady();

      mockLogin.mockImplementation(() => {
        mockError.value = null;
        return Promise.resolve();
      });

      const wrapper = mount(LoginPage, {
        global: {
          plugins: [pinia, targetRouter],
        },
      });

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[type="password"]').setValue('password123');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(targetRouter.currentRoute.value.path).toBe('/dashboard');
    });

    it('should not redirect when login sets an error', async () => {
      mockLogin.mockImplementation(() => {
        mockError.value = 'Invalid credentials';
        return Promise.resolve();
      });

      const wrapper = await mountLoginPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[type="password"]').setValue('wrong');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/login');
    });
  });

  describe('error display', () => {
    it('should display error message when error is set', async () => {
      mockError.value = 'Invalid credentials';
      const wrapper = await mountLoginPage();

      expect(wrapper.text()).toContain('Invalid credentials');
    });

    it('should not display error when error is null', async () => {
      mockError.value = null;
      const wrapper = await mountLoginPage();

      const errorEl = wrapper.find('[data-testid="error-message"]');
      expect(errorEl.exists()).toBe(false);
    });
  });
});
