import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Use sample.md instead of sample.ts: Playwright resolves `.ts` to MIME
// `video/mp2t` (per `mime-types`), which is NOT in the server's allowlist
// (packages/shared/src/validators/file.ts). The upload would be rejected and
// router.push would never fire, leaving the page on /posts/new. `.md` resolves
// to `text/markdown`, which is in ALLOWED_MIME_SAFE_TEXT.
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.md');

test('in-post rendering: uploaded file appears on PostViewPage post-file-list', async ({
  actor,
}, testInfo) => {
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`in-post-${stamp}`);
  await posts.newPostBody(actor).fill('console.log("body");');
  await files.fileUploadInput(actor).setInputFiles(SAMPLE);
  await posts.newPostSaveDraft(actor).click();

  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(files.postFileList(actor)).toContainText('sample.md');
});
