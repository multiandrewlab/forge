import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: nested replies render three levels deep', async ({ actor }) => {
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const post = await actor.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Nested seed',
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

  const top = await actor.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-0' },
  });
  expect(top.ok()).toBe(true);
  const {
    comment: { id: topId },
  } = (await top.json()) as { comment: { id: string } };

  const mid = await actor.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-1', parentId: topId },
  });
  expect(mid.ok()).toBe(true);
  const {
    comment: { id: midId },
  } = (await mid.json()) as { comment: { id: string } };

  const leaf = await actor.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'depth-2', parentId: midId },
  });
  expect(leaf.ok()).toBe(true);
  const {
    comment: { id: leafId },
  } = (await leaf.json()) as { comment: { id: string } };

  await actor.goto(`/posts/${postId}`);
  // Each child comment-{id} renders nested inside its parent's DOM subtree.
  await expect(comments.bodyOf(actor, topId)).toHaveText('depth-0');
  await expect(comments.item(actor, topId).locator(`[data-testid="comment-${midId}"]`)).toHaveCount(
    1,
  );
  await expect(
    comments.item(actor, midId).locator(`[data-testid="comment-${leafId}"]`),
  ).toHaveCount(1);
});
