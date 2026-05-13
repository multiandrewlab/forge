import { describe, it, expect } from 'vitest';
import { updatePostSchema } from '../../validators/post.js';

// Symmetry with createPostSchema's video branch: updating a post to contentType: 'video'
// must not accept a non-empty `content` field — video content lives on revisions, not on
// the update payload. See issue #102 code review (WU1 fix-up).

describe('updatePostSchema video discriminator', () => {
  it('accepts contentType: video with no content', () => {
    const r = updatePostSchema.safeParse({ contentType: 'video' });
    expect(r.success).toBe(true);
  });

  it('accepts contentType: video with title only', () => {
    const r = updatePostSchema.safeParse({ contentType: 'video', title: 'Renamed' });
    expect(r.success).toBe(true);
  });

  it('rejects contentType: video with non-empty content', () => {
    const r = updatePostSchema.safeParse({ contentType: 'video', content: 'hi' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = r.error.issues.map((i) => i.message);
      expect(messages.some((m) => /content is not allowed for video posts/.test(m))).toBe(true);
    }
  });

  it('accepts contentType: video with empty-string content (clients sometimes send field unconditionally)', () => {
    const r = updatePostSchema.safeParse({ contentType: 'video', content: '' });
    expect(r.success).toBe(true);
  });

  it('leaves non-video updates untouched (no content branch enforced for snippet)', () => {
    // updatePostSchema does not own snippet's content-required rule (revisions do);
    // this is a regression guard that the video branch did not break the sibling path.
    const r = updatePostSchema.safeParse({ contentType: 'snippet' });
    expect(r.success).toBe(true);
  });
});
