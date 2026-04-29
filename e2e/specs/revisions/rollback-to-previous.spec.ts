import { test, expect } from '../../fixtures/reset.js';
import { revisions } from '../../fixtures/selectors/revisions.js';

test('rollback: confirming restore swaps the post body to the chosen revision', async ({
  testuser,
}) => {
  // Storage state has the refresh_token cookie; mint an access token from it.
  // (Same pattern as create-auto-on-edit.spec.ts and create-manual-via-button.spec.ts.)
  const refresh = await testuser.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  // 1. Create a post (auto-creates revision 1 with content "first body").
  const created = await testuser.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Rollback seed',
      contentType: 'snippet',
      language: 'typescript',
      content: 'first body',
      visibility: 'public',
      isDraft: false,
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: createdPostId },
  } = (await created.json()) as { post: { id: string } };

  // 2. Add a 2nd revision via API with content "second body".
  // The post body is now "second body" (latest revision wins).
  const rev2 = await testuser.request.post(`/api/posts/${createdPostId}/revisions`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { content: 'second body', message: 'Second' },
  });
  expect(rev2.ok()).toBe(true);

  // 3. Open history page. Newest-first ordering means revisionItem.last() is
  // the oldest revision (rev 1, "first body"). The RestoreButton in
  // PostHistoryPage.vue is gated on `selectedIds.length === 1 && !isLatestSelected`
  // (PostHistoryPage.vue:37) — exactly one selection, NOT the newest. Selecting
  // .last() satisfies both conditions.
  await testuser.goto(`/posts/${createdPostId}/history`);
  await expect(revisions.revisionItem(testuser)).toHaveCount(2);
  await revisions.revisionItem(testuser).last().click();

  // 4. Open the confirm dialog and click Confirm.
  await revisions.restoreTrigger(testuser).click();
  await expect(revisions.restoreDialog(testuser)).toBeVisible();
  await revisions.restoreConfirm(testuser).click();

  // 5. Navigate to the post detail. The body should be rolled back to "first body".
  await testuser.goto(`/posts/${createdPostId}`);
  await expect(testuser.getByText(/first body/)).toBeVisible();
});
