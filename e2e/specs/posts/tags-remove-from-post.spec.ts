import { test, expect } from '../../fixtures/reset.js';

test('tags: clicking the tag-remove button removes the chip from the editor', async ({
  testuser,
}) => {
  // Auth + seed pattern mirrors edit-own-post.spec.ts.
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Tag-remove seed',
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

  // Add one tag, confirm chip count == 1, then click tag-remove and assert it
  // drops back to 0. (This post starts with no tags — a fresh API-created post
  // has no post_tags rows.)
  const tagInput = testuser.getByTestId('tag-input');
  await tagInput.fill('react');
  await tagInput.press('Enter');
  await expect(testuser.getByTestId('tag-item')).toHaveCount(1);

  await testuser.getByTestId('tag-remove').first().click();
  await expect(testuser.getByTestId('tag-item')).toHaveCount(0);
});
