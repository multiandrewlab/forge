import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test("comments: testuser sees alice's new comment via websocket broadcast", async ({
  testuser,
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Both load the post-view page
  await testuser.goto(`/posts/${cheatsheetId}`);
  await alice.goto(`/posts/${cheatsheetId}`);

  // Alice mints a token and posts a comment
  const refresh = await alice.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const broadcastBody = `broadcast-${Date.now()}`;
  await alice.request.post(`/api/posts/${cheatsheetId}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { body: broadcastBody },
  });

  // testuser's page should pick up the broadcast within 10s
  await expect(comments.section(testuser)).toContainText(broadcastBody, { timeout: 10_000 });
});
