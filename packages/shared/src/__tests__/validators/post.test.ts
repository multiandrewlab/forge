import { describe, it, expect } from 'vitest';
import { createPostSchema, updatePostSchema, createRevisionSchema } from '../../validators/post';
import type { CreatePostInput, UpdatePostInput, CreateRevisionInput } from '../../validators/post';
import type { PostRevision, PostWithRevision } from '../../types/index';

// ---------------------------------------------------------------------------
// createPostSchema
// ---------------------------------------------------------------------------
describe('createPostSchema', () => {
  const validInput = {
    title: 'My Post',
    contentType: 'snippet' as const,
    content: 'console.log("hello")',
  };

  // -- happy path --
  it('should accept valid input with all required fields', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('My Post');
      expect(result.data.contentType).toBe('snippet');
      expect(result.data.content).toBe('console.log("hello")');
    }
  });

  it('should apply default values for optional fields', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('public');
      expect(result.data.isDraft).toBe(true);
    }
  });

  it('should accept all optional fields', () => {
    const input = {
      ...validInput,
      language: 'typescript',
      visibility: 'private' as const,
      isDraft: false,
      tags: ['javascript', 'tutorial'],
    };
    const result = createPostSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('typescript');
      expect(result.data.visibility).toBe('private');
      expect(result.data.isDraft).toBe(false);
      expect(result.data.tags).toEqual(['javascript', 'tutorial']);
    }
  });

  // -- title --
  it('should reject an empty title', () => {
    const result = createPostSchema.safeParse({ ...validInput, title: '' });
    expect(result.success).toBe(false);
  });

  it('should accept a title of exactly 1 character', () => {
    const result = createPostSchema.safeParse({ ...validInput, title: 'A' });
    expect(result.success).toBe(true);
  });

  it('should accept a title of exactly 500 characters', () => {
    const result = createPostSchema.safeParse({ ...validInput, title: 'A'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('should reject a title longer than 500 characters', () => {
    const result = createPostSchema.safeParse({ ...validInput, title: 'A'.repeat(501) });
    expect(result.success).toBe(false);
  });

  // -- contentType --
  it('should accept all valid contentType values', () => {
    for (const ct of ['snippet', 'prompt', 'document', 'link']) {
      const result = createPostSchema.safeParse({ ...validInput, contentType: ct });
      expect(result.success).toBe(true);
    }
  });

  it('should reject an invalid contentType', () => {
    const result = createPostSchema.safeParse({ ...validInput, contentType: 'invalid' });
    expect(result.success).toBe(false);
  });

  // -- content --
  it('should reject missing content', () => {
    const { content: _, ...noContent } = validInput;
    void _;
    const result = createPostSchema.safeParse(noContent);
    expect(result.success).toBe(false);
  });

  it('should reject empty content', () => {
    const result = createPostSchema.safeParse({ ...validInput, content: '' });
    expect(result.success).toBe(false);
  });

  // -- language --
  it('should accept null language', () => {
    const result = createPostSchema.safeParse({ ...validInput, language: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBeNull();
    }
  });

  it('should accept undefined language (omitted)', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  // -- visibility --
  it('should accept public visibility', () => {
    const result = createPostSchema.safeParse({ ...validInput, visibility: 'public' });
    expect(result.success).toBe(true);
  });

  it('should accept private visibility', () => {
    const result = createPostSchema.safeParse({ ...validInput, visibility: 'private' });
    expect(result.success).toBe(true);
  });

  it('should reject an invalid visibility', () => {
    const result = createPostSchema.safeParse({ ...validInput, visibility: 'unlisted' });
    expect(result.success).toBe(false);
  });

  // -- tags --
  it('should accept up to 10 tags', () => {
    const tags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
    const result = createPostSchema.safeParse({ ...validInput, tags });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toHaveLength(10);
    }
  });

  it('should reject more than 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `tag${i}`);
    const result = createPostSchema.safeParse({ ...validInput, tags });
    expect(result.success).toBe(false);
  });

  it('should accept empty tags array', () => {
    const result = createPostSchema.safeParse({ ...validInput, tags: [] });
    expect(result.success).toBe(true);
  });

  it('should accept omitted tags (optional)', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  // -- strip unknown --
  it('should strip unknown properties', () => {
    const result = createPostSchema.safeParse({ ...validInput, extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra' in result.data).toBe(false);
    }
  });

  // -- type inference --
  it('should produce the correct CreatePostInput type shape', () => {
    const result = createPostSchema.safeParse(validInput);
    expect(result.success).toBe(true);
    if (result.success) {
      const data: CreatePostInput = result.data;
      expect(data.title).toBe(validInput.title);
      expect(data.contentType).toBe(validInput.contentType);
      expect(data.content).toBe(validInput.content);
    }
  });
});

// ---------------------------------------------------------------------------
// updatePostSchema
// ---------------------------------------------------------------------------
describe('updatePostSchema', () => {
  it('should accept an empty object (all fields optional)', () => {
    const result = updatePostSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept a valid title', () => {
    const result = updatePostSchema.safeParse({ title: 'Updated Title' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Updated Title');
    }
  });

  it('should reject an empty title when provided', () => {
    const result = updatePostSchema.safeParse({ title: '' });
    expect(result.success).toBe(false);
  });

  it('should accept a title of exactly 500 characters', () => {
    const result = updatePostSchema.safeParse({ title: 'A'.repeat(500) });
    expect(result.success).toBe(true);
  });

  it('should reject a title longer than 500 characters', () => {
    const result = updatePostSchema.safeParse({ title: 'A'.repeat(501) });
    expect(result.success).toBe(false);
  });

  it('should accept a valid visibility', () => {
    const result = updatePostSchema.safeParse({ visibility: 'private' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.visibility).toBe('private');
    }
  });

  it('should reject an invalid visibility', () => {
    const result = updatePostSchema.safeParse({ visibility: 'unlisted' });
    expect(result.success).toBe(false);
  });

  it('should accept a valid language', () => {
    const result = updatePostSchema.safeParse({ language: 'python' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBe('python');
    }
  });

  it('should accept null language', () => {
    const result = updatePostSchema.safeParse({ language: null });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.language).toBeNull();
    }
  });

  it('should accept a valid contentType', () => {
    const result = updatePostSchema.safeParse({ contentType: 'document' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contentType).toBe('document');
    }
  });

  it('should reject an invalid contentType', () => {
    const result = updatePostSchema.safeParse({ contentType: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('should NOT allow isDraft field (intentionally excluded)', () => {
    const result = updatePostSchema.safeParse({ isDraft: true });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('isDraft' in result.data).toBe(false);
    }
  });

  it('should accept multiple fields together', () => {
    const input = {
      title: 'New Title',
      visibility: 'public' as const,
      language: 'go',
      contentType: 'snippet' as const,
    };
    const result = updatePostSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(input);
    }
  });

  it('should strip unknown properties', () => {
    const result = updatePostSchema.safeParse({ title: 'Test', extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra' in result.data).toBe(false);
    }
  });

  it('should produce the correct UpdatePostInput type shape', () => {
    const input = { title: 'Updated', visibility: 'private' as const };
    const result = updatePostSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const data: UpdatePostInput = result.data;
      expect(data.title).toBe('Updated');
      expect(data.visibility).toBe('private');
    }
  });
});

// ---------------------------------------------------------------------------
// createRevisionSchema
// ---------------------------------------------------------------------------
describe('createRevisionSchema', () => {
  it('should accept valid input with content only', () => {
    const result = createRevisionSchema.safeParse({ content: 'new content' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('new content');
    }
  });

  it('should accept content with optional message', () => {
    const result = createRevisionSchema.safeParse({
      content: 'updated content',
      message: 'Fixed typo',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.content).toBe('updated content');
      expect(result.data.message).toBe('Fixed typo');
    }
  });

  it('should reject missing content', () => {
    const result = createRevisionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty content', () => {
    const result = createRevisionSchema.safeParse({ content: '' });
    expect(result.success).toBe(false);
  });

  it('should accept a message of exactly 500 characters', () => {
    const result = createRevisionSchema.safeParse({
      content: 'some content',
      message: 'M'.repeat(500),
    });
    expect(result.success).toBe(true);
  });

  it('should reject a message longer than 500 characters', () => {
    const result = createRevisionSchema.safeParse({
      content: 'some content',
      message: 'M'.repeat(501),
    });
    expect(result.success).toBe(false);
  });

  it('should accept omitted message (optional)', () => {
    const result = createRevisionSchema.safeParse({ content: 'content' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBeUndefined();
    }
  });

  it('should strip unknown properties', () => {
    const result = createRevisionSchema.safeParse({ content: 'c', extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra' in result.data).toBe(false);
    }
  });

  it('should produce the correct CreateRevisionInput type shape', () => {
    const result = createRevisionSchema.safeParse({
      content: 'revision content',
      message: 'Initial',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const data: CreateRevisionInput = result.data;
      expect(data.content).toBe('revision content');
      expect(data.message).toBe('Initial');
    }
  });
});

// ---------------------------------------------------------------------------
// Type-level checks: PostRevision, PostWithRevision
// ---------------------------------------------------------------------------
describe('Post types', () => {
  it('PostRevision should have all required fields', () => {
    const revision: PostRevision = {
      id: 'rev-1',
      postId: 'post-1',
      content: 'console.log("hello")',
      message: 'Initial version',
      revisionNumber: 1,
      createdAt: new Date(),
    };
    expect(revision.id).toBe('rev-1');
    expect(revision.postId).toBe('post-1');
    expect(revision.content).toBe('console.log("hello")');
    expect(revision.message).toBe('Initial version');
    expect(revision.revisionNumber).toBe(1);
    expect(revision.createdAt).toBeInstanceOf(Date);
  });

  it('PostRevision should allow null message', () => {
    const revision: PostRevision = {
      id: 'rev-1',
      postId: 'post-1',
      content: 'content',
      message: null,
      revisionNumber: 1,
      createdAt: new Date(),
    };
    expect(revision.message).toBeNull();
  });

  it('PostWithRevision should extend Post with revisions array', () => {
    const now = new Date();
    const post: PostWithRevision = {
      id: 'post-1',
      authorId: 'user-1',
      title: 'My Post',
      contentType: 'snippet',
      language: 'typescript',
      visibility: 'public',
      isDraft: false,
      forkedFromId: null,
      linkUrl: null,
      linkPreview: null,
      voteCount: 5,
      viewCount: 100,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      revisions: [
        {
          id: 'rev-1',
          postId: 'post-1',
          content: 'console.log("hello")',
          message: 'Initial',
          revisionNumber: 1,
          createdAt: now,
        },
      ],
    };
    expect(post.revisions).toHaveLength(1);
    const firstRevision = post.revisions[0];
    expect(firstRevision).toBeDefined();
    if (firstRevision) {
      expect(firstRevision.content).toBe('console.log("hello")');
    }
    expect(post.title).toBe('My Post');
  });
});
