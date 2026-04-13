import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock bookmark queries
vi.mock('../../db/queries/bookmarks.js', () => ({
  createBookmark: vi.fn(),
  deleteBookmark: vi.fn(),
  getUserBookmark: vi.fn(),
}));

// Mock post queries (findPostById)
vi.mock('../../db/queries/posts.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../db/queries/posts.js')>();
  return {
    ...original,
    findPostById: vi.fn(),
  };
});

// Mock findFeedPosts for GET /bookmarks
vi.mock('../../db/queries/feed.js', () => ({
  findFeedPosts: vi.fn(),
}));

import { query } from '../../db/connection.js';
import { createBookmark, deleteBookmark } from '../../db/queries/bookmarks.js';
import { findPostById } from '../../db/queries/posts.js';
import { findFeedPosts } from '../../db/queries/feed.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow } from '../../db/queries/types.js';
import type { BookmarkRow } from '../../db/queries/types.js';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';

const mockQuery = query as Mock;
const mockCreateBookmark = createBookmark as Mock;
const mockDeleteBookmark = deleteBookmark as Mock;
const mockFindPostById = findPostById as Mock;
const mockFindFeedPosts = findFeedPosts as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

const samplePostRow: PostRow = {
  id: postId,
  author_id: userId,
  title: 'Hello World',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleBookmark: BookmarkRow = {
  user_id: userId,
  post_id: postId,
  created_at: new Date('2026-01-01'),
};

function makeFeedRow(overrides: Partial<PostWithAuthorRow> = {}): PostWithAuthorRow {
  return {
    id: postId,
    author_id: userId,
    title: 'Hello World',
    content_type: 'snippet',
    language: 'typescript',
    visibility: 'public',
    is_draft: false,
    forked_from_id: null,
    link_url: null,
    link_preview: null,
    vote_count: 0,
    view_count: 0,
    search_vector: null,
    deleted_at: null,
    created_at: new Date('2026-01-01T00:00:00.000Z'),
    updated_at: new Date('2026-01-01T00:00:00.000Z'),
    author_display_name: 'Test User',
    author_avatar_url: null,
    tags: null,
    ...overrides,
  };
}

describe('bookmark routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress unused mock warning
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // ─── POST /api/posts/:id/bookmark ──────────────────────────────────

  describe('POST /api/posts/:id/bookmark', () => {
    it('creates a bookmark and returns { bookmarked: true }', async () => {
      mockFindPostById.mockResolvedValueOnce(samplePostRow);
      mockCreateBookmark.mockResolvedValueOnce(sampleBookmark);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/bookmark`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.bookmarked).toBe(true);
      expect(mockCreateBookmark).toHaveBeenCalledWith(userId, postId);
    });

    it('toggles off bookmark and returns { bookmarked: false }', async () => {
      mockFindPostById.mockResolvedValueOnce(samplePostRow);
      // createBookmark returns null = already exists
      mockCreateBookmark.mockResolvedValueOnce(null);
      mockDeleteBookmark.mockResolvedValueOnce(true);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/bookmark`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.bookmarked).toBe(false);
      expect(mockDeleteBookmark).toHaveBeenCalledWith(userId, postId);
    });

    it('returns 404 when post not found', async () => {
      mockFindPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/bookmark`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/bookmark`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── GET /api/bookmarks ────────────────────────────────────────────

  describe('GET /api/bookmarks', () => {
    it('returns paginated bookmarked posts', async () => {
      const row = makeFeedRow();
      mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: false });

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.posts).toHaveLength(1);
      expect(body.posts[0].id).toBe(postId);
      expect(body.cursor).toBeNull();
      expect(mockFindFeedPosts).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          filter: 'bookmarked',
          limit: 20,
        }),
      );
    });

    it('returns empty when no bookmarks', async () => {
      mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.posts).toHaveLength(0);
      expect(body.cursor).toBeNull();
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks',
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns cursor when hasMore is true', async () => {
      const row = makeFeedRow({ created_at: new Date('2026-01-15T12:00:00.000Z') });
      mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: true });

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks?limit=1',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.cursor).not.toBeNull();

      const decoded = JSON.parse(Buffer.from(body.cursor as string, 'base64').toString('utf8')) as {
        createdAt: string;
        id: string;
      };
      expect(decoded.id).toBe(postId);
      expect(decoded.createdAt).toBe(row.created_at.toISOString());
    });

    it('passes cursor to findFeedPosts', async () => {
      const cursorData = { createdAt: '2026-01-01T00:00:00.000Z', id: postId };
      const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
      mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

      const response = await app.inject({
        method: 'GET',
        url: `/api/bookmarks?cursor=${cursor}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
    });

    it('passes custom limit to findFeedPosts', async () => {
      mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks?limit=5',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ limit: 5 }));
    });

    it('returns 400 when limit > 100', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks?limit=101',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 400 when limit < 1', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/bookmarks?limit=0',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });
  });
});
