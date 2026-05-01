import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';
import type { Page } from '@playwright/test';

// All four tests below seed a fresh prompt post as `actor`, then click
// Run to assert streamed /api/playground/run output. At workers=4 these used
// to land on different workers concurrently — the per-userId AI rate-limit
// slot AND the actor-scoped seed/reset race produce empty-output flakes
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
  // a post id that's already visible to the actor; if a reset wiped it,
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
  actor,
}) => {
  await withMockScript(actor, 'default');
  const post = await seedPromptPost(actor, { content: 'Hi {{name}}!' });

  await actor.goto(`/playground/${post.id}`);
  await playground.variableInput(actor, 'name').fill('world');
  await playground.runBtn(actor).click();

  // Default script: ['Hello', ' world', '[done]']
  await expect
    .poll(async () => (await playground.outputContent(actor).textContent()) ?? '', {
      timeout: 10_000,
    })
    .toContain('Hello world');
});

test('playground: copy button writes streamed content to clipboard', async ({ actor }) => {
  // actor has its own browser context (per fixtures/auth.ts) — granting
  // permissions on the default `context` fixture has no effect on this page.
  await actor.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await withMockScript(actor, 'default');
  const post = await seedPromptPost(actor, { content: 'Hi {{name}}!' });

  await actor.goto(`/playground/${post.id}`);
  await playground.variableInput(actor, 'name').fill('there');
  await playground.runBtn(actor).click();
  await expect(playground.outputContent(actor)).toContainText('Hello world');

  await playground.copyBtn(actor).click();
  const clipboardText = await actor.evaluate(() => navigator.clipboard.readText());
  expect(clipboardText).toContain('Hello world');
});

test('playground: generate-readme-short script renders deterministic README chunks', async ({
  actor,
}) => {
  await withMockScript(actor, 'generate-readme-short');
  const post = await seedPromptPost(actor, { content: 'Generate a README for {{project}}' });
  await actor.goto(`/playground/${post.id}`);
  await playground.variableInput(actor, 'project').fill('forge');
  await playground.runBtn(actor).click();

  // generate-readme-short emits: ['# README\n', '\n', 'TODO: write content.', '[done]']
  // '# README' is the deterministic substring (single hash, not '## ').
  await expect(playground.outputContent(actor)).toContainText('# README', { timeout: 10_000 });
  await expect(playground.outputContent(actor)).toContainText('TODO: write content.');
});

test('playground: open prompt page renders header, source disclosure (collapsed), run button', async ({
  actor,
}) => {
  await withMockScript(actor, 'default');
  const post = await seedPromptPost(actor, { title: 'Greeting', content: 'Hi {{name}}!' });

  await actor.goto(`/playground/${post.id}`);

  await expect(playground.page(actor)).toBeVisible();
  await expect(playground.title(actor)).toContainText('Greeting');
  await expect(playground.runBtn(actor)).toBeVisible();
  // Disclosure is present and collapsed by default
  const disclosure = playground.promptSource(actor);
  await expect(disclosure).toBeVisible();
  await expect(disclosure).not.toHaveAttribute('open', '');
});

test('playground: post with multiple required vars renders all + gates Run', async ({ actor }) => {
  // Uses the seeded multi-required-var fixture post (c0000000-...-000000000051)
  // rather than ad-hoc seedPromptPost(). seedPromptPost POSTs a fresh post and
  // then immediately navigates to /playground/<id>; the page's GET /api/posts/:id
  // can race with a cross-worker /api/__test__/reset and 404 (the page renders
  // "Post not found" with no variable inputs). Seeded fixtures survive every
  // reset deterministically.
  const MULTI_VAR_FIXTURE_POST_ID = 'c0000000-0000-0000-0000-000000000051';
  await withMockScript(actor, 'default');
  await actor.goto(`/playground/${MULTI_VAR_FIXTURE_POST_ID}`);

  await expect(playground.variableInput(actor, 'name')).toBeVisible();
  await expect(playground.variableInput(actor, 'role')).toBeVisible();
  await expect(playground.variableInput(actor, 'project')).toBeVisible();

  await expect(playground.runBtn(actor)).toBeDisabled();
  await playground.variableInput(actor, 'name').fill('Andrew');
  await expect(playground.runBtn(actor)).toBeDisabled();
  await playground.variableInput(actor, 'role').fill('engineer');
  await expect(playground.runBtn(actor)).toBeDisabled();
  await playground.variableInput(actor, 'project').fill('forge');
  await expect(playground.runBtn(actor)).toBeEnabled();

  await playground.runBtn(actor).click();
  await expect(playground.outputContent(actor)).toContainText('Hello world');
});
