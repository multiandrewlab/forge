import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

// FIXME(#48): server-side edit-window enforcement does not exist as of 2026-04-30.
// `packages/server/src/routes/comments.ts:96-115` enforces ownership only, no time gate.
// Activate this spec once the gate lands. Specs MUST use page.clock to advance time
// deterministically — never waitForTimeout.
test.fixme('comments: cannot edit own comment after the edit window expires', async ({
  testuser,
}) => {
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await testuser.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Edit-window seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(post.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await post.json()) as { post: { id: string } };
  const c = await testuser.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'too late' },
  });
  expect(c.ok()).toBe(true);
  const {
    comment: { id: commentId },
  } = (await c.json()) as { comment: { id: string } };

  // Install the clock at install-time (page.clock.install) so subsequent
  // app-level Date.now() reflects the simulated time. See:
  // https://playwright.dev/docs/clock
  await testuser.clock.install({ time: new Date('2026-04-30T12:00:00Z') });
  await testuser.goto(`/posts/${postId}`);

  // Advance N+1 minutes past whatever window the server enforces
  await testuser.clock.fastForward('20:00'); // 20 minutes

  await comments.editBtnOf(testuser, commentId).click();
  // The PATCH should now 403 — the UI should surface an error
  // (exact assertion to be filled in once the server's response shape lands.)
  // Placeholder body shape: { error: 'Comment edit window expired' }
});
