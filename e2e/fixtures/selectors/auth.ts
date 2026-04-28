import type { Page, Locator } from '@playwright/test';

export const auth = {
  // Login page
  loginEmail: (page: Page): Locator => page.getByTestId('login-email-input'),
  loginPassword: (page: Page): Locator => page.getByTestId('login-password-input'),
  loginSubmit: (page: Page): Locator => page.getByTestId('login-submit-btn'),
  loginError: (page: Page): Locator => page.getByTestId('login-error-message'),

  // Register page
  registerEmail: (page: Page): Locator => page.getByTestId('register-email-input'),
  registerName: (page: Page): Locator => page.getByTestId('register-name-input'),
  registerPassword: (page: Page): Locator => page.getByTestId('register-password-input'),
  registerSubmit: (page: Page): Locator => page.getByTestId('register-submit-btn'),

  // Top bar (logged in)
  userMenuTrigger: (page: Page): Locator => page.getByTestId('user-menu-trigger'),
  logoutAction: (page: Page): Locator => page.getByTestId('logout-action'),
};
