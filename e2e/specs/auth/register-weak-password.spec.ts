import { randomUUID } from 'node:crypto';
import { test, expect } from '../../fixtures/reset.js';
import { auth } from '../../fixtures/selectors/auth.js';

test(
  'submitting a too-short password surfaces the Zod min-length error',
  { tag: '@no-reset' },
  async ({ browser }) => {
    // Anonymous context — /register expects an unauthenticated viewer.
    //
    // The Zod registerSchema in packages/shared/src/validators/auth.ts:14
    // declares `password: z.string().min(8).regex(...)`. A 3-character
    // password trips the .min(8) rule before the regex, producing Zod's
    // default message `"String must contain at least 8 character(s)"`.
    // RegisterPage.vue runs registerSchema.safeParse() locally (line 26)
    // and joins error.errors[].message into the validationError ref →
    // rendered into data-testid="validation-error"
    // (registerValidationError selector). We assert against the stable
    // substring "at least 8 character" so the test doesn't break if Zod
    // tweaks the surrounding wording.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const email = `weak-${randomUUID()}@example.com`;

    await page.goto('/register');
    await auth.registerEmail(page).fill(email);
    await auth.registerName(page).fill('Weak Password User');
    await auth.registerPassword(page).fill('abc');
    await auth.registerConfirmPassword(page).fill('abc');
    await auth.registerSubmit(page).click();
    await expect(auth.registerValidationError(page)).toContainText('at least 8 character');
    await ctx.close();
  },
);
