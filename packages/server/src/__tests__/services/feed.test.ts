import { describe, it, expect } from 'vitest';
import { toPostWithAuthor } from '../../services/feed.js';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';

const baseRow: PostWithAuthorRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Hello Feed',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 42,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-02'),
  author_display_name: 'Alice',
  author_avatar_url: 'https://example.com/avatar.png',
  tags: 'typescript,node,vitest',
};

describe('toPostWithAuthor', () => {
  it('maps all snake_case post fields to camelCase', () => {
    const result = toPostWithAuthor(baseRow);

    expect(result.id).toBe(baseRow.id);
    expect(result.authorId).toBe(baseRow.author_id);
    expect(result.title).toBe('Hello Feed');
    expect(result.contentType).toBe('snippet');
    expect(result.language).toBe('typescript');
    expect(result.visibility).toBe('public');
    expect(result.isDraft).toBe(false);
    expect(result.forkedFromId).toBeNull();
    expect(result.linkUrl).toBeNull();
    expect(result.linkPreview).toBeNull();
    expect(result.voteCount).toBe(5);
    expect(result.viewCount).toBe(42);
    expect(result.deletedAt).toBeNull();
    expect(result.createdAt).toEqual(new Date('2026-01-01'));
    expect(result.updatedAt).toEqual(new Date('2026-01-02'));
  });

  it('maps author fields into nested author object', () => {
    const result = toPostWithAuthor(baseRow);

    expect(result.author).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('splits comma-separated tags string into array', () => {
    const result = toPostWithAuthor(baseRow);

    expect(result.tags).toEqual(['typescript', 'node', 'vitest']);
  });

  it('returns empty array when tags is null', () => {
    const row: PostWithAuthorRow = { ...baseRow, tags: null };
    const result = toPostWithAuthor(row);

    expect(result.tags).toEqual([]);
  });

  it('returns empty array when tags is empty string', () => {
    const row: PostWithAuthorRow = { ...baseRow, tags: '' };
    const result = toPostWithAuthor(row);

    expect(result.tags).toEqual([]);
  });

  it('handles single tag', () => {
    const row: PostWithAuthorRow = { ...baseRow, tags: 'typescript' };
    const result = toPostWithAuthor(row);

    expect(result.tags).toEqual(['typescript']);
  });

  it('handles null avatarUrl', () => {
    const row: PostWithAuthorRow = { ...baseRow, author_avatar_url: null };
    const result = toPostWithAuthor(row);

    expect(result.author.avatarUrl).toBeNull();
  });

  it('maps linkUrl and linkPreview when present', () => {
    const row: PostWithAuthorRow = {
      ...baseRow,
      link_url: 'https://example.com',
      link_preview: { title: 'Example', description: 'A site', image: null, readingTime: 5 },
    };
    const result = toPostWithAuthor(row);

    expect(result.linkUrl).toBe('https://example.com');
    expect(result.linkPreview).toEqual({
      title: 'Example',
      description: 'A site',
      image: null,
      readingTime: 5,
    });
  });

  it('maps forkedFromId when present', () => {
    const row: PostWithAuthorRow = {
      ...baseRow,
      forked_from_id: '880e8400-e29b-41d4-a716-446655440000',
    };
    const result = toPostWithAuthor(row);

    expect(result.forkedFromId).toBe('880e8400-e29b-41d4-a716-446655440000');
  });

  it('maps deletedAt when present', () => {
    const row: PostWithAuthorRow = {
      ...baseRow,
      deleted_at: new Date('2026-06-01'),
    };
    const result = toPostWithAuthor(row);

    expect(result.deletedAt).toEqual(new Date('2026-06-01'));
  });
});
