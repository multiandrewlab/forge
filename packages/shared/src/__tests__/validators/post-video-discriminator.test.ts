import { describe, it, expect } from 'vitest';
import { createPostSchema } from '../../validators/post.js';

describe('createPostSchema video discriminator', () => {
  it('accepts a video post with only title', () => {
    const r = createPostSchema.safeParse({ title: 'My video', contentType: 'video' });
    expect(r.success).toBe(true);
  });

  it('accepts a video post with tags and visibility', () => {
    const r = createPostSchema.safeParse({
      title: 'My video',
      contentType: 'video',
      tags: ['typescript'],
      visibility: 'private',
      isDraft: true,
    });
    expect(r.success).toBe(true);
  });

  it('rejects a video post with non-empty content', () => {
    const r = createPostSchema.safeParse({
      title: 'My video',
      contentType: 'video',
      content: 'hello',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a video post with empty-string content', () => {
    // The revisions table owns video content; the create-time payload may include
    // an empty content string but nothing more.
    const r = createPostSchema.safeParse({
      title: 'My video',
      contentType: 'video',
      content: '',
    });
    expect(r.success).toBe(true);
  });

  it('still requires content for snippet posts', () => {
    const r = createPostSchema.safeParse({ title: 'snip', contentType: 'snippet' });
    expect(r.success).toBe(false);
  });

  it('still requires linkUrl for link posts', () => {
    const r = createPostSchema.safeParse({ title: 'l', contentType: 'link' });
    expect(r.success).toBe(false);
  });

  it('accepts a link post with linkUrl (regression: video branch did not break sibling)', () => {
    const r = createPostSchema.safeParse({
      title: 'l',
      contentType: 'link',
      linkUrl: 'https://example.com',
    });
    expect(r.success).toBe(true);
  });
});
