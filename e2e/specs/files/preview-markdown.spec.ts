import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.md');

test('preview markdown: rendered markdown variant shows the marker heading', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const title = `md-${stamp}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(title);
  await posts.newPostBody(actor).fill('seed');
  await files.fileUploadInput(actor).setInputFiles(FIX);
  // Publish (not draft): drafts are excluded from the public home feed
  // (server filter `p.is_draft = false`), so a draft post would not appear
  // on HomePage where PostDetail mounts FilePreview.
  await posts.newPostPublish(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // Navigate to HomePage where PostDetail mounts FilePreview inline.
  await actor.goto('/');
  // Click within the post-list to disambiguate from the same title rendered
  // as <h1> in the auto-selected PostDetail panel.
  await actor
    .getByTestId('post-list-item')
    .getByRole('heading', { name: title, exact: true })
    .click();
  // Explicitly select our file in the sidebar. filesStore.fetchFiles guards
  // `activeFileId` with `if (!activeFileId.value)` (packages/client/src/stores/files.ts:28),
  // so under parallel workers — when home auto-selects a different post first
  // and locks activeFileId to that post's file — switching posts via tile
  // click won't update the active file. The sidebar click forces it.
  await files.fileSidebarItem(actor, 'sample.md').click();
  await expect(files.filePreviewMarkdown(actor)).toContainText('e2e-md-fixture');
});
