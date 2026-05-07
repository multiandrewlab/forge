import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

test('replace: deleting then re-uploading a file with the same name serves the new bytes', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const filename = `replace-${stamp}.json`;

  // Bootstrap an access token via the actor's refresh cookie — this is the
  // same pattern used in e2e/specs/comments/empty-state.spec.ts and
  // e2e/specs/posts/edit-cancel-reverts.spec.ts (see grep output for
  // `accessToken` in e2e/specs/). filesStore.uploadFile uses Bearer auth, so
  // direct API GETs need this header.
  const refresh = await actor.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Save an EMPTY draft (no files staged). This avoids the
  //    PostEditPage-doesn't-hydrate-stagedFiles-on-mount trap: when we
  //    upload our seed file via the editor input AFTER landing on /edit,
  //    the upload populates filesStore.stagedFiles live and the sidebar
  //    renders. SPA navigation (router-link) preserves Pinia state across
  //    /posts/new → /posts/:id → /posts/:id/edit.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`replace-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  const postIdMatch = actor.url().match(/\/posts\/([a-f0-9-]+)/);
  expect(postIdMatch).not.toBeNull();
  const postId = (postIdMatch as RegExpMatchArray)[1];

  // 2. SPA-navigate to /edit via the Edit link.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(new RegExp(`/posts/${postId}/edit$`));

  // 3. Upload v1 — capture the response so we know its file id.
  const v1ResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from('{"marker":"e2e-original"}'),
  });
  const v1Body = (await (await v1ResponsePromise).json()) as { file: { id: string } };
  const v1Id = v1Body.file.id;
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 4. Remove → confirm gone from sidebar AND the file id 404s server-side
  //    (proves the DELETE persisted, not just a local UI mutation).
  await files.fileRemoveBtn(actor, filename).click();
  await expect(files.fileSidebarItem(actor, filename)).toHaveCount(0);
  const v1Check = await actor.request.get(`/api/posts/${postId}/files/${v1Id}`, { headers: auth });
  expect(v1Check.status()).toBe(404);

  // 5. Re-upload v2 with the SAME filename but different bytes; capture id.
  const v2ResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from('{"marker":"e2e-replaced"}'),
  });
  const v2Body = (await (await v2ResponsePromise).json()) as { file: { id: string } };
  const v2Id = v2Body.file.id;
  expect(v2Id).not.toBe(v1Id); // distinct row
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 6. Verify the served bytes are v2's content (proves "replace", not just
  //    "filename present").
  const v2Get = await actor.request.get(`/api/posts/${postId}/files/${v2Id}`, { headers: auth });
  expect(v2Get.status()).toBe(200);
  const v2Text = await v2Get.text();
  expect(v2Text).toContain('e2e-replaced');
  expect(v2Text).not.toContain('e2e-original');
});
