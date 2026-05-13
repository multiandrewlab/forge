import { test, expect } from '../../fixtures/reset.js';

/**
 * Spec §11.3 — cancelling a video upload mid-flight removes the entire draft.
 *
 *   actor creates a video draft, requests an upload URL (post_videos row
 *   created server-side, status='uploading'), then DELETE /video — the
 *   server-side wiring that the VideoEditor Cancel button (data-testid
 *   "video-editor-cancel-btn") and the inline VideoUploader cancel
 *   ("video-uploader-cancel") both call. The contract: DELETE /video on a
 *   draft is hard-delete semantics — the post + post_videos cascade
 *   together (packages/server/src/routes/video.ts WU5b 5.10). After cancel
 *   the post must return 404 on the detail GET.
 *
 *   We drive the upload-url request via APIRequestContext because the WU8b
 *   VideoUploader.onFileChange omits Content-Type: application/json on its
 *   POST (real bug, out of WU9 scope) — setInputFiles round-trips through
 *   that broken path and never gets the post_videos row inserted. The
 *   server contract under test is unaffected by the client header gap.
 */
test('video cancel: DELETE /video on a draft removes the post + cascade', async ({ actor }) => {
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  // Step 1: create a video draft via API + walk through the UI flow so the
  // edit page chrome renders (smokes the page wiring even though the file
  // upload itself is API-driven).
  await actor.goto('/posts/new');
  await actor.getByTestId('content-type-select').selectOption('video');
  await actor.getByTestId('new-post-title-input').fill('E2E video cancel draft');
  await actor.getByTestId('new-post-save-draft-btn').click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit/);
  const postId = new URL(actor.url()).pathname.split('/')[2];

  // Step 2: smoke that the video editor's file input mounted (proves
  // VideoEditor → VideoUploader chain rendered for a fresh video post).
  await expect(actor.getByTestId('video-file-input')).toBeVisible({ timeout: 10_000 });

  // Step 3: mint an upload URL via API — server inserts post_videos with
  // status='uploading'. This is the same path the inline VideoUploader
  // would have taken on a file-select event.
  const uploadRes = await actor.request.post(`/api/posts/${postId}/video/upload-url`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    data: { filename: 'cancel-target.mp4', fileSizeBytes: 3051 },
  });
  expect(uploadRes.ok()).toBe(true);

  // Confirm the post_videos row landed (cfUid is owner-only on GET /:id).
  const beforeCancel = await actor.request.get(`/api/posts/${postId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(beforeCancel.ok()).toBe(true);
  const beforeBody = (await beforeCancel.json()) as {
    post: { video?: { cfUid?: string } };
  };
  expect(beforeBody.post.video?.cfUid).toMatch(/^cf_mock_/);

  // Step 4: cancel — DELETE /api/posts/:id/video. This is the request the
  // Cancel button issues. Validate the server contract directly so the
  // assertion is independent of the WS-driven button-visibility gate.
  const cancelRes = await actor.request.delete(`/api/posts/${postId}/video`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(cancelRes.status()).toBe(204);

  // Step 5: the cancel handler hard-deletes the post. GET must 404.
  const afterCancel = await actor.request.get(`/api/posts/${postId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(afterCancel.status()).toBe(404);

  // Step 6: navigating to the edit page surfaces the standard "not found"
  // chrome — confirms the cascade end-to-end from the browser's POV.
  await actor.goto(`/posts/${postId}/edit`);
  // PostEditPage renders "Failed to load post." in the v-else branch when
  // fetchPost yields no currentPost. Either an explicit not-found chrome
  // OR the failed-load fallback satisfies the contract.
  await expect(actor.getByText(/failed to load post|not found/i).first()).toBeVisible({
    timeout: 10_000,
  });
});
