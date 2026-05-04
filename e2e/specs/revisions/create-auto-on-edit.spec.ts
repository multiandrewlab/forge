import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: editing a post auto-creates a new revision', async ({ actor }) => {
  // The browser's storage state has the refresh_token cookie but not an access
  // token (the access token is in-memory Pinia state, hydrated client-side
  // from /api/auth/refresh on boot — see packages/client/src/lib/restore-session.ts).
  // Mirror that flow: exchange the refresh cookie for an access token, then
  // call /api/posts with Authorization: Bearer <token>.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Auto-rev seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'initial',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  await actor.goto(`/posts/${createdPostId}/edit`);
  // Edit the body — the 2s debounce in PostEditPage triggers saveRevision
  // (auto-creates a new revision via POST /api/posts/:id/revisions).
  await posts.newPostBody(actor).fill('const updated: string = "auto revision body";');
  // Save Draft flushes the pending debounce timer immediately. Wait for the
  // POST /revisions response before navigating to /history; otherwise the
  // click resolves before the in-flight save lands and /history shows only
  // revision 1 (visible as the 1-vs-2 retry race when retries=0).
  await Promise.all([
    actor.waitForResponse(
      (resp) =>
        resp.url().includes(`/api/posts/${createdPostId}/revisions`) &&
        resp.request().method() === 'POST' &&
        resp.ok(),
    ),
    posts.newPostSaveDraft(actor).click(),
  ]);

  await actor.goto(`/posts/${createdPostId}/history`);
  // Initial post-creation auto-creates revision 1; the body edit auto-creates
  // revision 2. The timeline shows both.
  await expect(revisions.revisionItem(actor)).toHaveCount(2);
});
