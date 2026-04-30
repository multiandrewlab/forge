import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../db/connection.js';
import { findFeedPosts } from '../../db/queries/feed.js';

const mockQuery = query as Mock;

// Seed-data fixtures (see scripts/seed.sql + bruno/environments/local.bru)
const TESTUSER_ID = 'a0000000-0000-0000-0000-000000000099';
const CAROL_USER_ID = 'a0000000-0000-0000-0000-000000000003';
const CAROL_PRIVATE_POST_ID = 'c0000000-0000-0000-0000-000000000006';

describe('findFeedPosts visibility filter', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('default feed: includes a (visibility = public OR author_id = $caller) clause that excludes other-user private posts', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await findFeedPosts({ userId: TESTUSER_ID, sort: 'recent', limit: 50 });

    expect(mockQuery).toHaveBeenCalledOnce();
    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

    // The visibility clause must scope visible rows to public OR caller-authored.
    // Other-user private posts (e.g. carol's c…0006) are excluded by SQL.
    expect(sql).toContain("p.visibility = 'public'");
    expect(sql).toContain('p.author_id =');
    expect(sql).toMatch(/p\.visibility = 'public'\s+OR\s+p\.author_id =/);
    // The caller's userId must be one of the bound parameters
    expect(params).toContain(TESTUSER_ID);
    // Sanity: this is a default (non-mine) filter
    expect(sql).toContain('p.is_draft = false');
  });

  it("default feed: caller IS the author — visibility clause's author_id branch makes their own private posts visible", async () => {
    // When carol queries her own feed, the same WHERE clause becomes
    //   (p.visibility = 'public' OR p.author_id = <carol>)
    // which lets her own private post c…0006 pass through. We verify the SQL
    // is parameterized with carol's id (the OR branch she will match on).
    const sampleRow = {
      id: CAROL_PRIVATE_POST_ID,
      author_id: CAROL_USER_ID,
      title: 'Carol private',
      content_type: 'document',
      language: null,
      visibility: 'private',
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
      author_display_name: 'Carol Davis',
      author_avatar_url: null,
      tags: null,
      fork_count: 0,
      forked_from_title: null,
    };
    mockQuery.mockResolvedValue({ rows: [sampleRow], rowCount: 1 });

    const result = await findFeedPosts({ userId: CAROL_USER_ID, sort: 'recent', limit: 50 });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];
    // Caller (= author of the private post) is bound as a param so the
    // OR-branch admits their own private rows.
    expect(params).toContain(CAROL_USER_ID);
    expect(sql).toMatch(/p\.visibility = 'public'\s+OR\s+p\.author_id =/);
    // Returned row passes through (the SQL would have admitted it via author_id branch).
    const ids = result.posts.map((p) => p.id);
    expect(ids).toContain(CAROL_PRIVATE_POST_ID);
  });

  it('bookmarked filter: visibility clause is still applied so other-user private bookmarks are excluded', async () => {
    // EXPLICIT COVERAGE of design REV 2 audit row D — the bookmarks branch
    // must not be a back-door for viewing private posts the caller bookmarked
    // before they were made private (or never had access to).
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await findFeedPosts({
      userId: TESTUSER_ID,
      sort: 'recent',
      limit: 50,
      filter: 'bookmarked',
    });

    const [sql, params] = mockQuery.mock.calls[0] as [string, unknown[]];

    // bookmarks join is present
    expect(sql.toLowerCase()).toContain('bookmarks');
    // visibility clause is still applied alongside the bookmarks join
    expect(sql).toMatch(/p\.visibility = 'public'\s+OR\s+p\.author_id =/);
    // userId appears as both the bookmarks-join param AND the visibility-branch param
    const userIdOccurrences = params.filter((p) => p === TESTUSER_ID).length;
    expect(userIdOccurrences).toBeGreaterThanOrEqual(2);
  });

  it("filter='mine': visibility clause is SKIPPED because rows are already author-scoped", async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    await findFeedPosts({ userId: TESTUSER_ID, filter: 'mine', limit: 50 });

    const [sql] = mockQuery.mock.calls[0] as [string, unknown[]];
    // No redundant visibility clause when filter=mine — author_id = caller is the only scope.
    expect(sql).not.toContain("p.visibility = 'public'");
    // is_draft constraint also intentionally absent for filter=mine
    expect(sql).not.toContain('p.is_draft = false');
    expect(sql).toContain('p.author_id =');
  });
});
