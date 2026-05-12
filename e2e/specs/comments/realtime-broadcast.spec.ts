import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test("comments: actor sees alice's new comment via websocket broadcast", async ({
  actor,
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Both load the post-view page.
  await actor.goto(`/posts/${cheatsheetId}`);
  await alice.goto(`/posts/${cheatsheetId}`);

  // BEFORE alice posts, wait until actor's WebSocket has been server-confirmed
  // as subscribed to post:<id>. Without this, at workers=4 alice's POST can
  // outrun actor's subscribe frame and the broadcast goes to zero recipients
  // (broadcasts are fire-and-forget — no replay). See issue #90.
  await expect(comments.section(actor)).toHaveAttribute('data-channel-subscribed', 'true', {
    timeout: 10_000,
  });

  // Alice mints a token and posts a comment
  const refresh = await alice.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const broadcastBody = `broadcast-${Date.now()}`;
  const created = await alice.request.post(`/api/posts/${cheatsheetId}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { body: broadcastBody },
  });
  // Fail fast: if the comment write itself fails, surface that immediately
  // rather than waiting 10s for a websocket update that will never arrive.
  expect(created.ok()).toBe(true);

  // actor's page should pick up the broadcast within 10s
  await expect(comments.section(actor)).toContainText(broadcastBody, { timeout: 10_000 });
});
