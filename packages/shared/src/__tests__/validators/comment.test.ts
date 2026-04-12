import { describe, it, expect } from 'vitest';
import { createCommentSchema, updateCommentSchema } from '../../validators/comment.js';

describe('createCommentSchema', () => {
  it('accepts valid general comment', () => {
    const result = createCommentSchema.safeParse({ body: 'Great post!' });
    expect(result.success).toBe(true);
  });

  it('accepts valid inline comment with all optional fields', () => {
    const result = createCommentSchema.safeParse({
      body: 'Nice line',
      parentId: '550e8400-e29b-41d4-a716-446655440000',
      lineNumber: 5,
      revisionId: '660e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const result = createCommentSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects body over 10000 chars', () => {
    const result = createCommentSchema.safeParse({ body: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });

  it('rejects negative lineNumber', () => {
    const result = createCommentSchema.safeParse({ body: 'hi', lineNumber: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer lineNumber', () => {
    const result = createCommentSchema.safeParse({ body: 'hi', lineNumber: 1.5 });
    expect(result.success).toBe(false);
  });

  it('accepts null optional fields', () => {
    const result = createCommentSchema.safeParse({
      body: 'hi',
      parentId: null,
      lineNumber: null,
      revisionId: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('updateCommentSchema', () => {
  it('accepts valid body', () => {
    const result = updateCommentSchema.safeParse({ body: 'Updated comment' });
    expect(result.success).toBe(true);
  });

  it('rejects empty body', () => {
    const result = updateCommentSchema.safeParse({ body: '' });
    expect(result.success).toBe(false);
  });

  it('rejects body over 10000 chars', () => {
    const result = updateCommentSchema.safeParse({ body: 'x'.repeat(10001) });
    expect(result.success).toBe(false);
  });
});
