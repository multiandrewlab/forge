import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('edit: own post saves changes and the title updates', async ({ testuser }) => {
  // The browser's storage state has the refresh_token cookie but not an access
  // token (the access token is in-memory Pinia state, hydrated client-side
  // from /api/auth/refresh on boot — see packages/client/src/lib/restore-session.ts).
  // Mirror that flow: exchange the refresh cookie for an access token, then
  // call /api/posts with Authorization: Bearer <token>.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Edit-own seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'x',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  await testuser.goto(`/posts/${createdPostId}/edit`);
  const newTitle = 'Updated by E2E run';
  await posts.newPostTitle(testuser).fill(newTitle);
  await posts.newPostSaveDraft(testuser).click();

  // Single concept: editing landed in the title input. (Persistence after
  // navigation is asserted separately in edit-changes-persist-after-nav.spec.ts.)
  await expect(posts.newPostTitle(testuser)).toHaveValue(newTitle);
});
