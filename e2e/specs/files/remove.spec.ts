import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.md');

test('remove: clicking the remove button deletes the staged file server-side', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const filename = `remove-${stamp}.md`;

  // Bootstrap an access token for direct API verification (same pattern as
  // Task 9 — see e2e/specs/comments/empty-state.spec.ts).
  const refresh = await actor.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Save an EMPTY draft so we land on a post with no staged files.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`remove-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  const postId = actor.url().match(/\/posts\/([a-f0-9-]+)/)?.[1] ?? '';

  // 2. SPA-navigate to /edit.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(new RegExp(`/posts/${postId}/edit$`));

  // 3. Upload the seed file via the editor input (populates filesStore live;
  //    sidebar appears). Capture the response to know the file id.
  const uploadResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'text/markdown',
    buffer: readFileSync(FIX),
  });
  const uploadBody = (await (await uploadResponsePromise).json()) as { file: { id: string } };
  const fileId = uploadBody.file.id;
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 4. Click remove → UI confirms removal.
  await files.fileRemoveBtn(actor, filename).click();
  await expect(files.fileSidebarItem(actor, filename)).toHaveCount(0);

  // 5. Verify the DELETE actually persisted server-side. The store-level UI
  //    removal is a Pinia mutation that runs only on a 2xx response, but a
  //    direct API check eliminates any doubt and rules out a race where the
  //    UI updates optimistically.
  const get = await actor.request.get(`/api/posts/${postId}/files/${fileId}`, { headers: auth });
  expect(get.status()).toBe(404);

  // 6. The staged-files listing for this post is now empty (no revisionId
  //    query param hits the staged branch — packages/server/src/routes/files.ts:144).
  const list = await actor.request.get(`/api/posts/${postId}/files`, { headers: auth });
  expect(list.status()).toBe(200);
  const listBody = (await list.json()) as { files: { id: string }[] };
  expect(listBody.files.find((f) => f.id === fileId)).toBeUndefined();
});
