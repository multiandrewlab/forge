import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');

test('file-picker upload: a selected file appears in the staged-file preview', async ({
  actor,
}, testInfo) => {
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`file-picker-${testInfo.parallelIndex}`);
  await files.fileUploadInput(actor).setInputFiles(SAMPLE);
  await expect(files.fileUploadPreview(actor)).toContainText('sample.ts');
});
