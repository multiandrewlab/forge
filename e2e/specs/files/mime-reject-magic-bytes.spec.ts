import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

test('mime: a file whose magic bytes do not match its declared mime is rejected with a friendly error', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;

  // 1. Save EMPTY draft → /posts/:id.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`mime-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // 2. SPA-navigate to /edit so PostEditor is mounted with postId.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // 3. Drive the editor input (data-testid="file-upload-input"). Claim
  //    image/png mime but supply non-PNG bytes — the malicious-upload
  //    pattern from the DoD checklist. The server's fileTypeFromBuffer
  //    check (packages/server/src/routes/files.ts:71-79) detects the
  //    mismatch and returns 415 with "File content does not match
  //    declared MIME type". The store rejects, PostEditor's catch
  //    surfaces fileUploadError via friendlyUploadError(/415/).
  await files.fileUploadInput(actor).setInputFiles({
    name: `evil-${stamp}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from('this is not a real png — magic bytes are wrong'),
  });

  await expect(files.fileUploadError(actor)).toContainText(/unsupported file type/i);
});
