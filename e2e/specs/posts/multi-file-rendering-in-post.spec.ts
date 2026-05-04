import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: uploaded file appears on the post view page after save', async ({ actor }) => {
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill('File renders in post');
  // createPostSchema requires content for non-link types
  // (packages/shared/src/validators/post.ts:32). Save Draft otherwise no-ops.
  await posts.newPostBody(actor).fill('console.log("body");');
  await posts.fileUploadInput(actor).setInputFiles(ASSET);
  await posts.newPostSaveDraft(actor).click();

  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(actor.getByTestId('post-file-list')).toContainText('journey-asset.txt');
});
