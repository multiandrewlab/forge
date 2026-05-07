import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');

test('drag-drop upload: dropping a file on the drop zone stages it', async ({
  actor,
}, testInfo) => {
  // The drop zone is on the editor view, which only reaches it after a post
  // exists. Create a post first via UI so postId is set.
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`drag-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  // SPA-navigate to /edit via the `<router-link :to="{ name: 'post-edit' }">`
  // (verified at packages/client/src/pages/PostViewPage.vue:194). Hard reload
  // is irrelevant for THIS spec because the drop populates filesStore live —
  // but using the SPA link keeps the spec consistent with the rest of the
  // suite and avoids any state-loss surprise.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // Build an in-page DataTransfer from the fixture buffer.
  const buffer = readFileSync(SAMPLE);
  const filename = `drag-${stamp}.ts`;
  const dt = await actor.evaluateHandle(
    ({ data, name, type }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Uint8Array(data)], name, { type }));
      return dataTransfer;
    },
    { data: Array.from(buffer), name: filename, type: 'text/plain' },
  );

  await files.editorDropZone(actor).dispatchEvent('drop', { dataTransfer: dt });

  // Drop adds it to the staged-file sidebar (filesStore.stagedFiles).
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();
});
