import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: upload adds a file to the editor', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('Multi-file post');
  await posts.fileUploadInput(testuser).setInputFiles(ASSET);
  await expect(posts.fileUploadPreview(testuser)).toBeVisible();
});
