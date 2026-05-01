import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: preview shows the uploaded file name', async ({ actor }) => {
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill('Preview test');
  await posts.fileUploadInput(actor).setInputFiles(ASSET);
  await expect(posts.fileUploadPreview(actor)).toContainText('journey-asset.txt');
});
