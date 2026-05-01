import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: inline comment on revision line — indicator + body render', async ({ actor }) => {
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // Multi-line content so line 3 is meaningful.
  const create = await actor.request.post('/api/posts', {
    headers: auth,
    data: {
      title: 'Inline seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'line one\nline two\nline three',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(create.ok()).toBe(true);
  // POST /api/posts returns { post, revision } as SEPARATE top-level fields per
  // packages/server/src/routes/posts.ts:106-110 (toPost(...) + toRevision(...)).
  const {
    post: { id: postId },
    revision: { id: revisionId },
  } = (await create.json()) as {
    post: { id: string };
    revision: { id: string };
  };

  // Inline comment on line 3 of the initial revision
  await actor.request.post(`/api/posts/${postId}/comments`, {
    headers: auth,
    data: { body: 'inline body!', revisionId, lineNumber: 3 },
  });

  // The inline-comment indicator only renders inside PostDetail (the home-page
  // panel), NOT on the standalone PostViewPage at /posts/:id. Navigate to home,
  // click the post in the list to select it, then assert against the panel.
  await actor.goto('/');
  await actor.locator(`[data-post-id="${postId}"]`).click();
  const panel = actor.getByTestId('postdetail-panel');
  await expect(panel).toBeVisible();

  // Indicator button shows "1 comment on line 3"
  await expect(comments.inlineIndicator(actor, 3)).toBeVisible();
  await comments.inlineIndicator(actor, 3).click();
  // After click, InlineComment renders the body
  await expect(actor.getByText('inline body!')).toBeVisible();
});
