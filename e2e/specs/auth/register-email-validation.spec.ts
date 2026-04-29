import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test(
  'invalid email format is blocked by browser-native input validity',
  { tag: '@no-reset' },
  async ({ browser }) => {
    // Anonymous context — /register expects an unauthenticated viewer.
    //
    // RegisterPage.vue:65–72 declares the email field as `type="email"
    // required`. The browser's native HTML5 validity check fires on submit
    // BEFORE the form's @submit.prevent handler runs, so for `not-an-email`
    // the page never reaches the Zod parse path or any network call. Two
    // corroborating checks of one concept ("client-side validity blocks
    // submission"): URL stays on /register, and the email input reports
    // validity.valid === false. Mirrors login-empty-form-validation.spec.ts.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    await page.goto('/register');
    await auth.registerEmail(page).fill('not-an-email');
    await auth.registerName(page).fill('Email Validation User');
    await auth.registerPassword(page).fill('password123');
    await auth.registerConfirmPassword(page).fill('password123');
    await auth.registerSubmit(page).click();
    await expect(page).toHaveURL(/\/register(?:$|\?)/);
    await expect(auth.registerEmail(page)).toHaveJSProperty('validity.valid', false);
    await ctx.close();
  },
);
