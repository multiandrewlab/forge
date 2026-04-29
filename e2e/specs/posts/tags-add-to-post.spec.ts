import { test, expect } from '../../fixtures/reset.js';

test('tags: typing a tag and pressing Enter adds it as a chip in the editor', async ({
  testuser,
}) => {
  // Same auth pattern as edit-own-post.spec.ts: exchange the refresh-token
  // cookie for an access token, then create a post via the API so the spec is
  // independent of any seeded fixture and runs cleanly under the reset hook.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Tag-add seed',
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

  const tagInput = testuser.getByTestId('tag-input');
  await tagInput.fill('react');
  await tagInput.press('Enter');

  // Single concept: a tag-item chip with text "react" appears in the editor.
  await expect(testuser.getByTestId('tag-item').filter({ hasText: 'react' })).toBeVisible();
});
