import { describe, it, expect } from 'vitest';
import { toComment } from '../../services/comments.js';
import type { CommentWithAuthorRow } from '../../db/queries/types.js';

const baseRow: CommentWithAuthorRow = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Great post!',
  created_at: new Date('2026-01-01T00:00:00Z'),
  updated_at: new Date('2026-01-01T00:00:00Z'),
  author_display_name: 'Test User',
  author_avatar_url: 'https://example.com/avatar.png',
  revision_number: null,
};

describe('toComment', () => {
  it('transforms row to Comment DTO with author', () => {
    const result = toComment(baseRow);
    expect(result).toEqual({
      id: baseRow.id,
      postId: baseRow.post_id,
      author: {
        id: '550e8400-e29b-41d4-a716-446655440000',
        displayName: 'Test User',
        avatarUrl: 'https://example.com/avatar.png',
      },
      parentId: null,
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'Great post!',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('returns null author when author_id is null', () => {
    const row: CommentWithAuthorRow = {
      ...baseRow,
      author_id: null,
      author_display_name: null,
      author_avatar_url: null,
    };
    const result = toComment(row);
    expect(result.author).toBeNull();
  });

  it('maps inline comment fields', () => {
    const row: CommentWithAuthorRow = {
      ...baseRow,
      parent_id: '770e8400-e29b-41d4-a716-446655440000',
      line_number: 42,
      revision_id: '880e8400-e29b-41d4-a716-446655440000',
      revision_number: 3,
    };
    const result = toComment(row);
    expect(result.parentId).toBe('770e8400-e29b-41d4-a716-446655440000');
    expect(result.lineNumber).toBe(42);
    expect(result.revisionId).toBe('880e8400-e29b-41d4-a716-446655440000');
    expect(result.revisionNumber).toBe(3);
  });

  it('uses "Unknown" when author_display_name is null but author_id exists', () => {
    const row: CommentWithAuthorRow = {
      ...baseRow,
      author_display_name: null,
    };
    const result = toComment(row);
    expect(result.author?.displayName).toBe('Unknown');
  });
});
