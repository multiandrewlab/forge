import { describe, it, expect } from 'vitest';
import { toPost, toRevision, toPostWithRevision } from '../../services/posts.js';
import type { PostRow, PostRevisionRow, PostWithRevisionRow } from '../../db/queries/types.js';

const samplePostRow: PostRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  author_id: '660e8400-e29b-41d4-a716-446655440000',
  title: 'Hello World',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: true,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 5,
  view_count: 100,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-02'),
};

const sampleRevisionRow: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: '550e8400-e29b-41d4-a716-446655440000',
  author_id: '660e8400-e29b-41d4-a716-446655440000',
  content: 'console.log("hello");',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const samplePostWithRevisionRow: PostWithRevisionRow = {
  ...samplePostRow,
  revision_id: '880e8400-e29b-41d4-a716-446655440000',
  content: 'console.log("hello");',
  revision_number: 1,
  message: 'Initial version',
  tags: null,
};

describe('posts service', () => {
  describe('toPost', () => {
    it('transforms a PostRow to a Post DTO', () => {
      const result = toPost(samplePostRow);

      expect(result).toEqual({
        id: samplePostRow.id,
        authorId: samplePostRow.author_id,
        title: 'Hello World',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'public',
        isDraft: true,
        forkedFromId: null,
        linkUrl: null,
        linkPreview: null,
        voteCount: 5,
        viewCount: 100,
        deletedAt: null,
        createdAt: samplePostRow.created_at,
        updatedAt: samplePostRow.updated_at,
      });
    });

    it('maps linkPreview correctly when present', () => {
      const rowWithPreview: PostRow = {
        ...samplePostRow,
        link_url: 'https://example.com',
        link_preview: { title: 'Example', description: 'A site', image: null, readingTime: 5 },
      };
      const result = toPost(rowWithPreview);

      expect(result.linkUrl).toBe('https://example.com');
      expect(result.linkPreview).toEqual({
        title: 'Example',
        description: 'A site',
        image: null,
        readingTime: 5,
      });
    });

    it('maps forkedFromId when present', () => {
      const forkedRow: PostRow = {
        ...samplePostRow,
        forked_from_id: '880e8400-e29b-41d4-a716-446655440000',
      };
      const result = toPost(forkedRow);

      expect(result.forkedFromId).toBe('880e8400-e29b-41d4-a716-446655440000');
    });

    it('maps deletedAt when present', () => {
      const deletedRow: PostRow = {
        ...samplePostRow,
        deleted_at: new Date('2026-06-01'),
      };
      const result = toPost(deletedRow);

      expect(result.deletedAt).toEqual(new Date('2026-06-01'));
    });
  });

  describe('toRevision', () => {
    it('transforms a PostRevisionRow to a PostRevision DTO', () => {
      const result = toRevision(sampleRevisionRow);

      expect(result).toEqual({
        id: sampleRevisionRow.id,
        postId: sampleRevisionRow.post_id,
        authorId: sampleRevisionRow.author_id,
        authorDisplayName: null,
        authorAvatarUrl: null,
        content: 'console.log("hello");',
        message: 'Initial version',
        revisionNumber: 1,
        createdAt: sampleRevisionRow.created_at,
      });
    });

    it('handles null message', () => {
      const noMessageRow: PostRevisionRow = {
        ...sampleRevisionRow,
        message: null,
      };
      const result = toRevision(noMessageRow);

      expect(result.message).toBeNull();
    });

    it('maps author fields when present (PostRevisionWithAuthorRow)', () => {
      const rowWithAuthor = {
        ...sampleRevisionRow,
        author_display_name: 'Test User',
        author_avatar_url: 'https://example.com/avatar.png',
      };
      const result = toRevision(rowWithAuthor);

      expect(result.authorId).toBe(sampleRevisionRow.author_id);
      expect(result.authorDisplayName).toBe('Test User');
      expect(result.authorAvatarUrl).toBe('https://example.com/avatar.png');
    });

    it('handles null author_id by defaulting authorId to empty string', () => {
      const noAuthorRow: PostRevisionRow = {
        ...sampleRevisionRow,
        author_id: null,
      };
      const result = toRevision(noAuthorRow);

      expect(result.authorId).toBe('');
    });
  });

  describe('toPostWithRevision', () => {
    it('transforms a PostWithRevisionRow to a PostWithRevision DTO', () => {
      const result = toPostWithRevision(samplePostWithRevisionRow);

      expect(result).toEqual({
        id: samplePostRow.id,
        authorId: samplePostRow.author_id,
        title: 'Hello World',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'public',
        isDraft: true,
        forkedFromId: null,
        linkUrl: null,
        linkPreview: null,
        voteCount: 5,
        viewCount: 100,
        deletedAt: null,
        createdAt: samplePostRow.created_at,
        updatedAt: samplePostRow.updated_at,
        revisions: [
          {
            id: '880e8400-e29b-41d4-a716-446655440000',
            postId: samplePostRow.id,
            authorId: samplePostRow.author_id,
            authorDisplayName: null,
            authorAvatarUrl: null,
            content: 'console.log("hello");',
            message: 'Initial version',
            revisionNumber: 1,
            createdAt: samplePostRow.created_at,
          },
        ],
        tags: [],
      });
    });

    it('splits the comma-separated tags column into an array', () => {
      const row: PostWithRevisionRow = { ...samplePostWithRevisionRow, tags: 'rust,typescript' };
      const dto = toPostWithRevision(row);
      expect(dto.tags).toEqual(['rust', 'typescript']);
    });

    it('returns empty tags when row.tags is null', () => {
      const row: PostWithRevisionRow = { ...samplePostWithRevisionRow, tags: null };
      const dto = toPostWithRevision(row);
      expect(dto.tags).toEqual([]);
    });

    it('returns empty tags when row.tags is the empty string', () => {
      const row: PostWithRevisionRow = { ...samplePostWithRevisionRow, tags: '' };
      const dto = toPostWithRevision(row);
      expect(dto.tags).toEqual([]);
    });
  });
});
