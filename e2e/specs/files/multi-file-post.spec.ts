import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = (n: string) => join(__dirname, '..', '..', 'fixtures', 'files', n);

test('multi-file post: 3 files attached to one post all appear, in upload order', async ({
  actor,
}, testInfo) => {
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`multi-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  // Stage three files locally (pre-create) — order is preserved through:
  //   localStagedFiles.push (Array order)
  //   → flushLocal sequential filesStore.uploadFile calls
  //   → server-side getNextSortOrder assigns monotonically increasing sortOrder
  //   → PostViewPage renders revisionFiles by sortOrder ascending
  // Order IS user-meaningful (file picker semantics, code-runner uses
  // activeFilename). We assert order, not just presence.
  await files
    .fileUploadInput(actor)
    .setInputFiles([FIX('sample.json'), FIX('sample.yaml'), FIX('sample.md')]);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // All three filenames present.
  await expect(files.postFileList(actor)).toContainText('sample.json');
  await expect(files.postFileList(actor)).toContainText('sample.yaml');
  await expect(files.postFileList(actor)).toContainText('sample.md');

  // Order assertion — the rendered <li> sequence must match upload order.
  const items = await files.postFileList(actor).locator('li').allTextContents();
  expect(items).toEqual(['sample.json', 'sample.yaml', 'sample.md']);
});
