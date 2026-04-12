import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock findFeedPosts so we control its return value without a real DB
vi.mock('../../db/queries/feed.js', () => ({
  findFeedPosts: vi.fn(),
}));

import { query } from '../../db/connection.js';
import { findFeedPosts } from '../../db/queries/feed.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';

const mockQuery = query as Mock;
const mockFindFeedPosts = findFeedPosts as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

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

describe('GET /api/posts (feed)', () => {
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
    // Suppress unused mock warning — query mock is set up globally
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  });

  // ─── Auth ────────────────────────────────────────────────────────────

  it('returns 401 without auth token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
    });

    expect(response.statusCode).toBe(401);
  });

  // ─── Default behaviour ───────────────────────────────────────────────

  it('returns posts with default sort (recent)', async () => {
    const row = makeFeedRow();
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].id).toBe(postId);
    expect(body.cursor).toBeNull();
  });

  it('passes sort=trending to findFeedPosts', async () => {
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?sort=trending',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'trending' }));
  });

  it('passes sort=top to findFeedPosts', async () => {
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?sort=top',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ sort: 'top' }));
  });

  // ─── Validation errors ───────────────────────────────────────────────

  it('returns 400 for invalid sort value', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?sort=invalid',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when limit > 100', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?limit=101',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when limit < 1', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?limit=0',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid filter value', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?filter=unknown',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 for invalid type value', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?type=invalid',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 when tag exceeds 50 characters', async () => {
    const longTag = 'a'.repeat(51);
    const response = await app.inject({
      method: 'GET',
      url: `/api/posts?tag=${longTag}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBeDefined();
  });

  // ─── Cursor pagination ───────────────────────────────────────────────

  it('builds cursor from last row when hasMore=true', async () => {
    const row = makeFeedRow({ created_at: new Date('2026-01-15T12:00:00.000Z') });
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: true });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?limit=1',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cursor).not.toBeNull();

    // Cursor should decode to { createdAt, id } for the last row
    const decoded = JSON.parse(Buffer.from(body.cursor as string, 'base64').toString('utf8')) as {
      createdAt: string;
      id: string;
    };
    expect(decoded.id).toBe(postId);
    expect(decoded.createdAt).toBe(row.created_at.toISOString());
  });

  it('returns null cursor when no more results', async () => {
    const row = makeFeedRow();
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.cursor).toBeNull();
  });

  // ─── userId from JWT ─────────────────────────────────────────────────

  it('passes userId from JWT to findFeedPosts', async () => {
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ userId }));
  });

  // ─── Filter / tag / type passthrough ────────────────────────────────

  it('passes tag and type filters to findFeedPosts', async () => {
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?tag=typescript&type=snippet',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFindFeedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ tag: 'typescript', type: 'snippet' }),
    );
  });

  it('passes filter=mine to findFeedPosts', async () => {
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts?filter=mine',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFindFeedPosts).toHaveBeenCalledWith(
      expect.objectContaining({ filter: 'mine', userId }),
    );
  });

  it('passes cursor to findFeedPosts', async () => {
    const cursorData = { createdAt: '2026-01-01T00:00:00.000Z', id: postId };
    const cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: `/api/posts?cursor=${cursor}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(mockFindFeedPosts).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  // ─── Response shape ──────────────────────────────────────────────────

  it('maps PostWithAuthorRow to PostWithAuthor DTO correctly', async () => {
    const row = makeFeedRow({
      tags: 'typescript,nodejs',
      author_display_name: 'Jane Doe',
      author_avatar_url: 'https://example.com/avatar.png',
    });
    mockFindFeedPosts.mockResolvedValueOnce({ posts: [row], hasMore: false });

    const response = await app.inject({
      method: 'GET',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const post = body.posts[0];
    expect(post.author.displayName).toBe('Jane Doe');
    expect(post.author.avatarUrl).toBe('https://example.com/avatar.png');
    expect(post.tags).toEqual(['typescript', 'nodejs']);
  });
});
