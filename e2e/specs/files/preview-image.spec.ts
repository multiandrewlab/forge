import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';

/**
 * Build a valid PNG buffer larger than the server's INLINE_THRESHOLD (64 KB at
 * packages/shared/src/validators/file.ts) so the upload routes to object
 * storage. Inlining a binary file as the `content` text column triggers a
 * Postgres "invalid byte sequence for encoding UTF8" 500 — see
 * packages/server/src/routes/files.ts step 9 + packages/server/src/services/files.ts:44.
 *
 * 256x256 RGBA, no IDAT compression, ~262 KB — enough to cross the threshold.
 * Generating in-spec keeps Task 8 within its declared 5-file scope.
 */
function buildLargePng(): Buffer {
  const width = 256;
  const height = 256;
  const raw = Buffer.alloc(height * (1 + width * 4));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    raw[offset++] = 0; // filter byte: None
    for (let x = 0; x < width; x++) {
      raw[offset++] = (x ^ y) & 0xff; // R
      raw[offset++] = (x * 7 + y * 11) & 0xff; // G
      raw[offset++] = (x + y * 3) & 0xff; // B
      raw[offset++] = 0xff; // A
    }
  }
  const idatData = deflateSync(raw, { level: 0 });

  function crc32(buf: Buffer): number {
    let c = 0xffffffff;
    for (const byte of buf) {
      c ^= byte;
      for (let k = 0; k < 8; k++) {
        c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('preview image: image variant renders an <img> with decoded PNG bytes', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const title = `img-${stamp}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(title);
  await posts.newPostBody(actor).fill('seed');
  // Buffer-form with a >64KB PNG so the file routes to object storage.
  // The server would 500 on inline-storage of binary content (UTF-8 mismatch),
  // and the existing fixtures/files/sample.png is 68 bytes — too small.
  await files.fileUploadInput(actor).setInputFiles({
    name: 'sample.png',
    mimeType: 'image/png',
    buffer: buildLargePng(),
  });
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
