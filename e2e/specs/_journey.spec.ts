import { test, expect } from '../fixtures/reset.js';
import { auth } from '../fixtures/selectors/auth.js';
import { posts } from '../fixtures/selectors/posts.js';
import { shell } from '../fixtures/selectors/shell.js';
import { withMockScript } from '../fixtures/mock-llm.js';

const FRESH_USER = {
  email: 'journey+register@example.com',
  name: 'Journey Tester',
  password: 'password123',
};

test.describe.serial('Phase 1 — auth: register, login, logout, relogin', () => {
  test('register a fresh account', { tag: '@no-reset' }, async ({ browser }) => {
    // Pre-condition: page is anonymous (we drive a raw context, not the
    // testuser fixture). Tagged @no-reset so we don't wipe the user we just
    // created before the assertion runs in the next test in this describe block.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/register');
    await auth.registerEmail(page).fill(FRESH_USER.email);
    await auth.registerName(page).fill(FRESH_USER.name);
    await auth.registerPassword(page).fill(FRESH_USER.password);
    // The Zod registerSchema requires confirm_password to match — the planned
    // snippet omitted it because it assumed a 3-field form. The actual form
    // has a confirm field; fill it so submission can succeed.
    await auth.registerConfirmPassword(page).fill(FRESH_USER.password);
    await auth.registerSubmit(page).click();
    await expect(page).toHaveURL('/');
    await ctx.close();
  });

  test('logout from a logged-in session', async ({ testuser }) => {
    await testuser.goto('/');
    await auth.userMenuTrigger(testuser).click();
    await auth.logoutAction(testuser).click();
    await expect(testuser).toHaveURL(/\/login/);
  });

  test('relogin via the login form', async ({ browser }) => {
    const ctx = await browser.newContext(); // anonymous
    const page = await ctx.newPage();
    await page.goto('/login');
    await auth.loginEmail(page).fill('testuser@example.com');
    await auth.loginPassword(page).fill('password123');
    await auth.loginSubmit(page).click();
    await expect(page).toHaveURL('/');
    await ctx.close();
  });
});

test.describe.serial('Phase 2 — draft', () => {
  test('create a draft post and land on its view page', async ({ testuser }) => {
    await testuser.goto('/posts/new');
    await posts.newPostTitle(testuser).fill('Journey draft');
    await posts.newPostBody(testuser).fill('Draft body content for the journey smoke.');
    await posts.newPostSaveDraft(testuser).click();
    await expect(testuser).toHaveURL(/\/posts\/[^/]+/);
    await expect(posts.postTitle(testuser)).toContainText('Journey draft');
    await expect(posts.draftBadge(testuser)).toBeVisible();
  });
});

test.describe.serial('Phase 3 — publish (AI autocomplete + upload + publish)', () => {
  test.skip('TODO: AI autocomplete + upload + publish', () => {});
});

test.describe.serial('Phase 4 — social (search + vote + bookmark + comment)', () => {
  test.skip('TODO: social interactions', () => {});
});

test.describe.serial('Phase 5 — fork', () => {
  test.skip('TODO: fork + diff', () => {});
});

test.describe.serial('Phase 6 — permission', () => {
  test.skip('TODO: alice cannot edit testuser snippet', () => {});
});

// keep `withMockScript` and `shell` referenced so unused-import lint doesn't
// trip on the scaffold; they're used in subsequent phases below.
void withMockScript;
void shell;
