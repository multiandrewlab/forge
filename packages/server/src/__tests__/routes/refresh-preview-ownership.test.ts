import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

import { query } from '../../db/connection.js';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import type { PostRow } from '../../db/queries/types.js';

const mockQuery = query as Mock;

// Seed-data fixtures (see scripts/seed.sql + bruno/environments/local.bru).
// alice's link post is `c…0007`; testuser is the non-owner caller.
const ALICE_USER_ID = 'a0000000-0000-0000-0000-000000000001';
const TESTUSER_ID = 'a0000000-0000-0000-0000-000000000099';
const ALICE_LINK_POST_ID = 'c0000000-0000-0000-0000-000000000007';

const aliceLinkPostRow: PostRow = {
  id: ALICE_LINK_POST_ID,
  author_id: ALICE_USER_ID,
  title: 'A neat article',
  content_type: 'link',
  language: null,
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: 'https://example.com/article',
  link_preview: { title: 'Old', description: null, image: null, readingTime: 1 },
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('POST /api/posts/:id/refresh-preview ownership (regression)', () => {
  let app: FastifyInstance;
  let nonOwnerToken: string;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    nonOwnerToken = app.jwt.sign({
      id: TESTUSER_ID,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${ALICE_LINK_POST_ID}/refresh-preview`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 403 when caller is not the post owner', async () => {
    // findPostById returns alice's link post; caller is testuser (non-owner)
    mockQuery.mockResolvedValueOnce({ rows: [aliceLinkPostRow], rowCount: 1 });

    const res = await app.inject({
      method: 'POST',
      url: `/api/posts/${ALICE_LINK_POST_ID}/refresh-preview`,
      headers: { authorization: `Bearer ${nonOwnerToken}` },
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: 'Only the author can refresh the link preview' });
  });
});
