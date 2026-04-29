import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSET = join(__dirname, '..', '..', 'fixtures', 'journey-asset.txt');

test('multi-file: preview shows the uploaded file name', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('Preview test');
  await posts.fileUploadInput(testuser).setInputFiles(ASSET);
  await expect(posts.fileUploadPreview(testuser)).toContainText('journey-asset.txt');
});
