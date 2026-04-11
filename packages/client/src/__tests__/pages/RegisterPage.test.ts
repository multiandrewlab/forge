import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';

// Mock useAuth composable
const mockRegister = vi.fn();
const mockError: Ref<string | null> = ref(null);

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    register: mockRegister,
    error: mockError,
  }),
}));

import RegisterPage from '@/pages/RegisterPage.vue';

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/register', name: 'register', component: RegisterPage },
      { path: '/login', name: 'login', component: { template: '<div>Login</div>' } },
    ],
  });
}

describe('RegisterPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockRegister.mockReset();
    mockError.value = null;
  });

  async function mountRegisterPage() {
    router.push('/register');
    await router.isReady();

    return mount(RegisterPage, {
      global: {
        plugins: [pinia, router],
      },
    });
  }

  describe('rendering', () => {
    it('should render email input', async () => {
      const wrapper = await mountRegisterPage();
      const emailInput = wrapper.find('input[type="email"]');
      expect(emailInput.exists()).toBe(true);
    });

    it('should render display name input', async () => {
      const wrapper = await mountRegisterPage();
      const nameInput = wrapper.find('input[data-testid="display-name"]');
      expect(nameInput.exists()).toBe(true);
    });

    it('should render password input', async () => {
      const wrapper = await mountRegisterPage();
      const passwordInput = wrapper.find('input[data-testid="password"]');
      expect(passwordInput.exists()).toBe(true);
    });

    it('should render confirm password input', async () => {
      const wrapper = await mountRegisterPage();
      const confirmInput = wrapper.find('input[data-testid="confirm-password"]');
      expect(confirmInput.exists()).toBe(true);
    });

    it('should render a submit button', async () => {
      const wrapper = await mountRegisterPage();
      const button = wrapper.find('button[type="submit"]');
      expect(button.exists()).toBe(true);
    });

    it('should render a link to the login page', async () => {
      const wrapper = await mountRegisterPage();
      const loginLink = wrapper.find('a[href="/login"]');
      expect(loginLink.exists()).toBe(true);
    });
  });

  describe('client-side validation', () => {
    it('should show validation error for invalid email', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('not-an-email');
      await wrapper.find('input[data-testid="display-name"]').setValue('Test');
      await wrapper.find('input[data-testid="password"]').setValue('password1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('password1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('email');
    });

    it('should show validation error for mismatched passwords', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('Test');
      await wrapper.find('input[data-testid="password"]').setValue('password1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('different1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('match');
    });

    it('should show validation error for short password', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('Test');
      await wrapper.find('input[data-testid="password"]').setValue('short1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('short1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should show validation error for password without number', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('Test');
      await wrapper.find('input[data-testid="password"]').setValue('passwordonly');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('passwordonly');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  describe('form submission', () => {
    it('should call register with form data on valid submit', async () => {
      mockRegister.mockResolvedValue(undefined);
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('new@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('New User');
      await wrapper.find('input[data-testid="password"]').setValue('password1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('password1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).toHaveBeenCalledWith({
        email: 'new@example.com',
        display_name: 'New User',
        password: 'password1',
        confirm_password: 'password1',
      });
    });

    it('should redirect to "/" on successful registration', async () => {
      mockRegister.mockImplementation(() => {
        mockError.value = null;
        return Promise.resolve();
      });

      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('new@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('New User');
      await wrapper.find('input[data-testid="password"]').setValue('password1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('password1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/');
    });

    it('should not redirect when registration sets an error', async () => {
      mockRegister.mockImplementation(() => {
        mockError.value = 'Email already exists';
        return Promise.resolve();
      });

      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('existing@example.com');
      await wrapper.find('input[data-testid="display-name"]').setValue('Test');
      await wrapper.find('input[data-testid="password"]').setValue('password1');
      await wrapper.find('input[data-testid="confirm-password"]').setValue('password1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/register');
    });
  });

  describe('error display', () => {
    it('should display server error when error is set', async () => {
      mockError.value = 'Email already exists';
      const wrapper = await mountRegisterPage();

      expect(wrapper.text()).toContain('Email already exists');
    });

    it('should not display error when error is null', async () => {
      mockError.value = null;
      const wrapper = await mountRegisterPage();

      const errorEl = wrapper.find('[data-testid="error-message"]');
      expect(errorEl.exists()).toBe(false);
    });
  });
});
