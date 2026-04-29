import type { Page, Locator } from '@playwright/test';

export const auth = {
  // LoginPage
  googleSigninLink: (page: Page): Locator => page.getByTestId('login-google-btn'),
  loginEmail: (page: Page): Locator => page.getByTestId('login-email-input'),
  loginError: (page: Page): Locator => page.getByTestId('login-error-message'),
  loginPassword: (page: Page): Locator => page.getByTestId('login-password-input'),
  loginSubmit: (page: Page): Locator => page.getByTestId('login-submit-btn'),

  // RegisterPage
  registerConfirmPassword: (page: Page): Locator =>
    page.getByTestId('register-confirm-password-input'),
  registerEmail: (page: Page): Locator => page.getByTestId('register-email-input'),
  registerName: (page: Page): Locator => page.getByTestId('register-name-input'),
  registerPassword: (page: Page): Locator => page.getByTestId('register-password-input'),
  registerServerError: (page: Page): Locator => page.getByTestId('error-message'),
  registerSubmit: (page: Page): Locator => page.getByTestId('register-submit-btn'),
  registerValidationError: (page: Page): Locator => page.getByTestId('validation-error'),

  // AuthCallbackPage
  authCallbackLoading: (page: Page): Locator => page.getByTestId('auth-callback-loading'),

  // AccountLinkPage
  accountLinkCancelLink: (page: Page): Locator => page.getByTestId('account-link-cancel-link'),
  accountLinkError: (page: Page): Locator => page.getByTestId('error-message'),
  accountLinkForm: (page: Page): Locator => page.getByTestId('account-link-form'),
  accountLinkHeading: (page: Page): Locator => page.getByTestId('account-link-heading'),
  accountLinkPasswordInput: (page: Page): Locator =>
    page.getByTestId('account-link-password-input'),
  accountLinkSubmitBtn: (page: Page): Locator => page.getByTestId('account-link-submit-btn'),

  // TopBar (logged in)
  logoutAction: (page: Page): Locator => page.getByTestId('logout-action'),
  userMenuTrigger: (page: Page): Locator => page.getByTestId('user-menu-trigger'),
};
