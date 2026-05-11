import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

/**
 * Preview-image regression: a published post with a small PNG attachment
 * renders an <img> via FilePreview on the home page.
 *
 * Per issue #86, binary MIME types (image/png, image/jpeg, image/gif,
 * image/webp) route to object storage regardless of size, so the 68-byte
 * sample.png fixture uploads successfully without the pre-#86 workaround
 * that synthesised a >64KB PNG to bypass the inline-storage path.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.png');

test('preview image: image variant renders an <img> with decoded PNG bytes', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const title = `img-${stamp}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(title);
  await posts.newPostBody(actor).fill('seed');
  // 68-byte sample.png uploads directly post-#86 (binary MIMEs route to
  // object storage regardless of size).
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
  await files.fileSidebarItem(actor, 'sample.png').click();

  const img = files.filePreviewImage(actor).locator('img');
  await expect(img).toBeVisible();
  await expect(img).toHaveAttribute('alt', /sample\.png/);
  // Prove the PNG bytes decoded: a broken image has naturalWidth === 0.
  await expect
    .poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
    .toBe(true);
});
