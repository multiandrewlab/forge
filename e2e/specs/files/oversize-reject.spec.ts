import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

test('oversize: a file > 10 MB is rejected client-side with a friendly error', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;

  // 1. Save EMPTY draft (no files) → /posts/:id.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`oversize-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // 2. SPA-navigate to /edit.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // 3. Stage a tiny file via the EDITOR input so filesStore.stagedFiles
  //    populates and the FileSidebar renders. The FileUpload component is
  //    only mounted as part of the editable FileSidebar slot.
  await files.fileUploadInput(actor).setInputFiles({
    name: `seed-${stamp}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('seed'),
  });
  await expect(files.fileSidebarItem(actor, `seed-${stamp}.txt`)).toBeVisible();

  // 4. Now drop the oversize buffer through the FileUpload component's input
  //    (data-testid="file-upload-input-sidebar", added in Task 3 step 5).
  //    THIS handler enforces MAX_FILE_SIZE client-side at FileUpload.vue:48.
  const oversizeBuffer = Buffer.alloc(11 * 1024 * 1024, 0x61); // 11 MB of 'a'
  await files.fileUploadInputSidebar(actor).setInputFiles({
    name: `huge-${stamp}.txt`,
    mimeType: 'text/plain',
    buffer: oversizeBuffer,
  });

  // 5. The friendly client-side error renders with the canonical text from
  //    FileUpload.vue:49 — `File "${file.name}" exceeds 10MB limit`.
  await expect(files.fileUploadClientError(actor)).toContainText(/exceeds 10\s?MB/i);
});
