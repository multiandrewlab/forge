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
      const nameInput = wrapper.find('input[data-testid="register-name-input"]');
      expect(nameInput.exists()).toBe(true);
    });

    it('should render password input', async () => {
      const wrapper = await mountRegisterPage();
      const passwordInput = wrapper.find('input[data-testid="register-password-input"]');
      expect(passwordInput.exists()).toBe(true);
    });

    it('should render confirm password input', async () => {
      const wrapper = await mountRegisterPage();
      const confirmInput = wrapper.find('input[data-testid="register-confirm-password-input"]');
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

  describe('a11y: required-field indicators', () => {
    it.each([
      ['email', 'register-email-input', 'register-email-required'],
      ['display-name', 'register-name-input', 'register-name-required'],
      ['password', 'register-password-input', 'register-password-required'],
      ['confirm-password', 'register-confirm-password-input', 'register-confirm-password-required'],
    ])('shows the visible asterisk on the %s label', async (_field, _inputId, indicatorId) => {
      const wrapper = await mountRegisterPage();
      const indicator = wrapper.find(`[data-testid="${indicatorId}"]`);
      expect(indicator.exists()).toBe(true);
      expect(indicator.text()).toBe('*');
      expect(indicator.attributes('aria-hidden')).toBe('true');
    });

    it('includes sr-only "required" text for each required field', async () => {
      const wrapper = await mountRegisterPage();
      const srOnly = wrapper.findAll('.sr-only').filter((el) => el.text() === 'required');
      expect(srOnly).toHaveLength(4);
    });

    it.each([
      'register-email-input',
      'register-name-input',
      'register-password-input',
      'register-confirm-password-input',
    ])('sets aria-required="true" on %s', async (inputId) => {
      const wrapper = await mountRegisterPage();
      const input = wrapper.find(`input[data-testid="${inputId}"]`);
      expect(input.attributes('aria-required')).toBe('true');
      expect(input.attributes('required')).toBeDefined();
    });
  });

  describe('client-side validation', () => {
    it('should show validation error for invalid email', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('not-an-email');
      await wrapper.find('input[data-testid="register-name-input"]').setValue('Test');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('password1');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('password1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('email');
    });

    it('should show validation error for mismatched passwords', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="register-name-input"]').setValue('Test');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('password1');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('different1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain('match');
    });

    it('should show validation error for short password', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="register-name-input"]').setValue('Test');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('short1');
      await wrapper.find('input[data-testid="register-confirm-password-input"]').setValue('short1');
      await wrapper.find('form').trigger('submit');
      await flushPromises();

      expect(mockRegister).not.toHaveBeenCalled();
    });

    it('should show validation error for password without number', async () => {
      const wrapper = await mountRegisterPage();

      await wrapper.find('input[type="email"]').setValue('test@example.com');
      await wrapper.find('input[data-testid="register-name-input"]').setValue('Test');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('passwordonly');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('passwordonly');
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
      await wrapper.find('input[data-testid="register-name-input"]').setValue('New User');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('password1');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('password1');
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
      await wrapper.find('input[data-testid="register-name-input"]').setValue('New User');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('password1');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('password1');
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
      await wrapper.find('input[data-testid="register-name-input"]').setValue('Test');
      await wrapper.find('input[data-testid="register-password-input"]').setValue('password1');
      await wrapper
        .find('input[data-testid="register-confirm-password-input"]')
        .setValue('password1');
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
