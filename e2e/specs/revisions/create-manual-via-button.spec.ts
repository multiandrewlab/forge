import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('revisions: clicking Save Revision creates a new revision with the current body', async ({
  actor,
}) => {
  // Storage state has the refresh_token cookie; mint an access token from it.
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Manual-rev seed',
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
  await posts.newPostBody(actor).fill('manual revision body');
  // The Save Revision button POSTs the current body as a new revision with
  // an explicit "Manual revision" message. It bypasses the 2s body debounce
  // and lands the snapshot immediately.
  await posts.saveRevisionBtn(actor).click();

  await actor.goto(`/posts/${createdPostId}/history`);
  // Initial post-creation auto-creates revision 1; the manual button click
  // creates revision 2.
  await expect(revisions.revisionItem(actor)).toHaveCount(2);
});
