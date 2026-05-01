import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';
import type { Page } from '@playwright/test';

// All four tests below seed a fresh prompt post as `testuser`, then click
// Run to assert streamed /api/playground/run output. At workers=4 these used
// to land on different workers concurrently — the per-userId AI rate-limit
// slot AND the testuser-scoped seed/reset race produce empty-output flakes
// (slot-busy 429, or `__test__/reset` between worker A's seed and worker A's
// fetch wipes the post out from under it). Forcing serial mode within this
// file keeps all four flows on the same worker, so reset → seed → run
// observes the seeded post.
test.describe.configure({ mode: 'serial' });

async function seedPromptPost(
  page: Page,
  options: { content?: string; title?: string } = {},
): Promise<{ id: string }> {
  const refresh = await page.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();
  const created = await page.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: options.title ?? `e2e-prompt-${Date.now()}`,
      contentType: 'prompt',
      language: 'markdown',
      content: options.content ?? 'Hello {{name}}!',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBeTruthy();
  const { post } = await created.json();
  // A cross-worker /api/__test__/reset can wipe the post between the POST
  // above and the page's later GET /api/posts/:id, surfacing a "Post not
  // found" page with no variable inputs. Poll the GET here so callers get
  // a post id that's already visible to the testuser; if a reset wiped it,
  // re-POST and try again. Bounded to a few attempts so transient 404s
  // surface as a real failure rather than hanging.
  return ensurePostVisible(page, post, accessToken, options);
}

async function ensurePostVisible(
  page: Page,
  post: { id: string },
  accessToken: string,
  options: { content?: string; title?: string },
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const verify = await page.request.get(`/api/posts/${post.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (verify.ok()) return post;
    const recreated = await page.request.post('/api/posts', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        title: options.title ?? `e2e-prompt-${Date.now()}`,
        contentType: 'prompt',
        language: 'markdown',
        content: options.content ?? 'Hello {{name}}!',
        visibility: 'public',
        isDraft: false,
      },
    });
    if (recreated.ok()) {
      const { post: newPost } = await recreated.json();
      post = newPost;
    }
  }
  return post;
}

test('playground: fill required var, run, output streams chunks (progressive)', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, { content: 'Hi {{name}}!' });

  await testuser.goto(`/playground/${post.id}`);
  await playground.variableInput(testuser, 'name').fill('world');
  await playground.runBtn(testuser).click();

  // Default script: ['Hello', ' world', '[done]']
  await expect
    .poll(async () => (await playground.outputContent(testuser).textContent()) ?? '', {
      timeout: 10_000,
    })
    .toContain('Hello world');
});

test('playground: copy button writes streamed content to clipboard', async ({ testuser }) => {
  // testuser has its own browser context (per fixtures/auth.ts) — granting
  // permissions on the default `context` fixture has no effect on this page.
  await testuser.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, { content: 'Hi {{name}}!' });

  await testuser.goto(`/playground/${post.id}`);
  await playground.variableInput(testuser, 'name').fill('there');
  await playground.runBtn(testuser).click();
  await expect(playground.outputContent(testuser)).toContainText('Hello world');

  await playground.copyBtn(testuser).click();
  const clipboardText = await testuser.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('Hello world');
});

test('playground: generate-readme-short script renders deterministic README chunks', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'generate-readme-short');
  const post = await seedPromptPost(testuser, { content: 'Generate a README for {{project}}' });
  await testuser.goto(`/playground/${post.id}`);
  await playground.variableInput(testuser, 'project').fill('forge');
  await playground.runBtn(testuser).click();

  // generate-readme-short emits: ['# README\n', '\n', 'TODO: write content.', '[done]']
  // '# README' is the deterministic substring (single hash, not '## ').
  await expect(playground.outputContent(testuser)).toContainText('# README', { timeout: 10_000 });
  await expect(playground.outputContent(testuser)).toContainText('TODO: write content.');
});

test('playground: open prompt page renders header, source disclosure (collapsed), run button', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  const post = await seedPromptPost(testuser, { title: 'Greeting', content: 'Hi {{name}}!' });

  await testuser.goto(`/playground/${post.id}`);

  await expect(playground.page(testuser)).toBeVisible();
  await expect(playground.title(testuser)).toContainText('Greeting');
  await expect(playground.runBtn(testuser)).toBeVisible();
  // Disclosure is present and collapsed by default
  const disclosure = playground.promptSource(testuser);
  await expect(disclosure).toBeVisible();
  await expect(disclosure).not.toHaveAttribute('open', '');
});

test('playground: post with multiple required vars renders all + gates Run', async ({
  testuser,
}) => {
  // Uses the seeded multi-required-var fixture post (c0000000-...-000000000051)
  // rather than ad-hoc seedPromptPost(). seedPromptPost POSTs a fresh post and
  // then immediately navigates to /playground/<id>; the page's GET /api/posts/:id
  // can race with a cross-worker /api/__test__/reset and 404 (the page renders
  // "Post not found" with no variable inputs). Seeded fixtures survive every
  // reset deterministically.
  const MULTI_VAR_FIXTURE_POST_ID = 'c0000000-0000-0000-0000-000000000051';
  await withMockScript(testuser, 'default');
  await testuser.goto(`/playground/${MULTI_VAR_FIXTURE_POST_ID}`);

  await expect(playground.variableInput(testuser, 'name')).toBeVisible();
  await expect(playground.variableInput(testuser, 'role')).toBeVisible();
  await expect(playground.variableInput(testuser, 'project')).toBeVisible();

  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'name').fill('Andrew');
  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'role').fill('engineer');
  await expect(playground.runBtn(testuser)).toBeDisabled();
  await playground.variableInput(testuser, 'project').fill('forge');
  await expect(playground.runBtn(testuser)).toBeEnabled();

  await playground.runBtn(testuser).click();
  await expect(playground.outputContent(testuser)).toContainText('Hello world');
});
