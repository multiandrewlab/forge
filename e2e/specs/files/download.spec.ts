import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.json');

test('download: clicking the per-file Download button triggers a real file download', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`download-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await files.fileUploadInput(actor).setInputFiles(FIX);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  const [download] = await Promise.all([
    actor.waitForEvent('download'),
    files.postFileDownloadLink(actor).first().click(),
  ]);
  expect(download.suggestedFilename()).toContain('sample.json');
});
