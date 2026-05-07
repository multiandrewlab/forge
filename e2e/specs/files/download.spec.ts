import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.json');

// Tombstone for the missing download-as-attachment user flow. The DoD for
// #51 lists "download" as a distinct scenario, but no UI affordance exists
// in the codebase as of issue #51 implementation. See follow-up issue
// #83 for the implementation tracking.
test.fixme('download: a user-visible download affordance triggers a file download', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`download-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await files.fileUploadInput(actor).setInputFiles(FIX);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // EXPECTED behavior (not yet implemented — see follow-up issue cited
  // in the test.fixme() comment below): a "Download" affordance appears
  // next to each file in post-file-list. Clicking triggers a real download.
  const [download] = await Promise.all([
    actor.waitForEvent('download'),
    actor.getByTestId('post-file-download-link').first().click(),
  ]);
  expect(download.suggestedFilename()).toContain('sample.json');
});
