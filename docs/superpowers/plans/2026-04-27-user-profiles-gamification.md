# User Profiles & Gamification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement public user profile pages with post history, contribution stats, and gamification badges (top contributor, tag expert).

**Architecture:** New `GET /api/users/:id` endpoint computes stats and badges via SQL aggregation queries (not stored). Frontend adds a `UserProfilePage` with `UserStats` cards and `UserBadge` components. Existing avatar elements become `RouterLink`s to `/user/:id`.

**Tech Stack:** Fastify route + Zod validation, PostgreSQL aggregation queries, Vue 3 Composition API + Tailwind CSS v4, Vitest + Vue Test Utils

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `packages/shared/src/types/profile.ts` | UserProfile, UserStats, UserBadge TypeScript interfaces |
| `packages/server/src/db/queries/user-profiles.ts` | SQL queries: post count, total votes, top tags, top contributors, tag experts |
| `packages/server/src/services/user-profiles.ts` | Transform DB rows → DTOs, assemble badge list |
| `packages/server/src/routes/user-profiles.ts` | `GET /api/users/:id` endpoint |
| `packages/client/src/composables/useUserProfile.ts` | Data-fetching composable for user profiles |
| `packages/client/src/components/user/UserBadge.vue` | Badge pill with icon + tooltip |
| `packages/client/src/components/user/UserStats.vue` | Three stat cards (posts, votes, top tags) |
| `packages/client/src/pages/UserProfilePage.vue` | Full profile page layout |
| `packages/server/src/__tests__/db/queries/user-profiles.test.ts` | Query unit tests |
| `packages/server/src/__tests__/services/user-profiles.test.ts` | Service unit tests |
| `packages/server/src/__tests__/routes/user-profiles.test.ts` | Route integration tests |
| `packages/client/src/__tests__/composables/useUserProfile.test.ts` | Composable tests |
| `packages/client/src/__tests__/components/user/UserBadge.test.ts` | Badge component tests |
| `packages/client/src/__tests__/components/user/UserStats.test.ts` | Stats component tests |
| `packages/client/src/__tests__/pages/UserProfilePage.test.ts` | Profile page tests |
| `bruno/users/get-user-profile.bru` | Bruno API test for GET /api/users/:id |
| `bruno/users/get-user-profile-not-found.bru` | Bruno API test for 404 case |

### Modified Files

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Export new profile types |
| `packages/server/src/db/queries/index.ts` | Export user-profiles queries |
| `packages/server/src/app.ts` | Register userProfileRoutes at `/api/users` |
| `packages/client/src/plugins/router.ts` | Add `user/:id` child route under AppLayout |
| `packages/client/src/components/post/PostListItem.vue` | Wrap author avatar+name in `RouterLink` to `/user/:id` |
| `packages/client/src/components/post/PostMetaHeader.vue` | Wrap author avatar+name in `RouterLink` to `/user/:id` |
| `packages/client/src/components/post/CommentThread.vue` | Wrap author name in `RouterLink` to `/user/:id` |
| `packages/client/src/components/history/RevisionTimeline.vue` | Wrap author avatar+name in `RouterLink` to `/user/:id` |
| `bruno/environments/local.bru` | Add `testuser` variable with seeded UUID |

---

## Task 1: Shared Types

**Files:**
- Create: `packages/shared/src/types/profile.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Create profile types**

```typescript
// packages/shared/src/types/profile.ts

export interface UserProfileBadge {
  type: 'top_contributor' | 'tag_expert';
  label: string;
  rank?: number; // 1-3 for top_contributor
}

export interface UserProfileStats {
  postCount: number;
  totalVotes: number;
  topTags: Array<{ tagName: string; voteSum: number }>;
}

export interface UserProfilePost {
  id: string;
  title: string;
  contentType: string;
  language: string | null;
  voteCount: number;
  createdAt: string;
  tags: string[];
}

export interface UserProfileResponse {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    createdAt: string;
  };
  stats: UserProfileStats;
  badges: UserProfileBadge[];
  posts: UserProfilePost[];
  cursor: string | null;
}
```

- [ ] **Step 2: Export from barrel**

Add to `packages/shared/src/types/index.ts`:

```typescript
export type {
  UserProfileBadge,
  UserProfileStats,
  UserProfilePost,
  UserProfileResponse,
} from './profile.js';
```

- [ ] **Step 3: Verify build**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/types/profile.ts packages/shared/src/types/index.ts
git commit -m "feat: add shared types for user profile, stats, and badges"
```

---

## Task 2: Database Queries

**Files:**
- Create: `packages/server/src/db/queries/user-profiles.ts`
- Create: `packages/server/src/__tests__/db/queries/user-profiles.test.ts`
- Modify: `packages/server/src/db/queries/index.ts`

- [ ] **Step 1: Write failing tests for user-profiles queries**

```typescript
// packages/server/src/__tests__/db/queries/user-profiles.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { query } from '../../../db/connection.js';
import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../../../db/queries/user-profiles.js';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

const mockQuery = query as Mock;
const userId = '550e8400-e29b-41d4-a716-446655440000';

describe('user-profiles queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUserPostCount', () => {
    it('returns count of public non-draft non-deleted posts', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '5' }] });
      const result = await getUserPostCount(userId);
      expect(result).toBe(5);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('visibility'),
        [userId],
      );
    });

    it('returns 0 when user has no posts', async () => {
      mockQuery.mockResolvedValue({ rows: [{ count: '0' }] });
      const result = await getUserPostCount(userId);
      expect(result).toBe(0);
    });
  });

  describe('getUserTotalVotes', () => {
    it('returns sum of vote_count across all non-deleted posts', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '42' }] });
      const result = await getUserTotalVotes(userId);
      expect(result).toBe(42);
    });

    it('returns 0 when COALESCE handles null', async () => {
      mockQuery.mockResolvedValue({ rows: [{ total: '0' }] });
      const result = await getUserTotalVotes(userId);
      expect(result).toBe(0);
    });
  });

  describe('getUserTopTags', () => {
    it('returns top 5 tags sorted by vote sum', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { tag_name: 'typescript', vote_sum: '20' },
          { tag_name: 'react', vote_sum: '10' },
        ],
      });
      const result = await getUserTopTags(userId);
      expect(result).toEqual([
        { tag_name: 'typescript', vote_sum: 20 },
        { tag_name: 'react', vote_sum: 10 },
      ]);
    });

    it('returns empty array when user has no tagged posts', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserTopTags(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getTopContributors', () => {
    it('returns top 3 author IDs by vote sum', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          { author_id: 'user-1', total_votes: '100' },
          { author_id: 'user-2', total_votes: '80' },
          { author_id: 'user-3', total_votes: '60' },
        ],
      });
      const result = await getTopContributors();
      expect(result).toEqual([
        { author_id: 'user-1', total_votes: 100 },
        { author_id: 'user-2', total_votes: 80 },
        { author_id: 'user-3', total_votes: 60 },
      ]);
    });

    it('excludes contributors below minimum vote threshold', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getTopContributors();
      expect(result).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('HAVING'),
      );
    });
  });

  describe('getTagExperts', () => {
    it('returns tag names where user is top contributor with minimums met', async () => {
      mockQuery.mockResolvedValue({
        rows: [{ tag_name: 'typescript' }, { tag_name: 'node' }],
      });
      const result = await getTagExperts(userId);
      expect(result).toEqual([
        { tag_name: 'typescript' },
        { tag_name: 'node' },
      ]);
    });

    it('returns empty array when user has no expert tags', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getTagExperts(userId);
      expect(result).toEqual([]);
    });
  });

  describe('getUserPublicPosts', () => {
    it('returns paginated public posts with tags', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'post-1',
            title: 'My Post',
            content_type: 'snippet',
            language: 'typescript',
            vote_count: 5,
            created_at: new Date('2026-01-01'),
            tags: 'typescript,node',
          },
        ],
      });
      const result = await getUserPublicPosts(userId, 20);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('My Post');
      expect(result[0].tags).toBe('typescript,node');
    });

    it('respects cursor-based pagination', async () => {
      mockQuery.mockResolvedValue({ rows: [] });
      const result = await getUserPublicPosts(userId, 20, '2026-01-01T00:00:00.000Z_post-1');
      expect(result).toEqual([]);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.arrayContaining([userId]),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/user-profiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the queries**

```typescript
// packages/server/src/db/queries/user-profiles.ts
import { query } from '../connection.js';

export interface TopTagRow {
  tag_name: string;
  vote_sum: number;
}

export interface TopContributorRow {
  author_id: string;
  total_votes: number;
}

export interface TagExpertRow {
  tag_name: string;
}

export interface UserPublicPostRow {
  id: string;
  title: string;
  content_type: string;
  language: string | null;
  vote_count: number;
  created_at: Date;
  tags: string | null;
}

export async function getUserPostCount(userId: string): Promise<number> {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM posts
     WHERE author_id = $1 AND deleted_at IS NULL
       AND visibility = 'public' AND is_draft = false`,
    [userId],
  );
  return parseInt(result.rows[0].count, 10);
}

export async function getUserTotalVotes(userId: string): Promise<number> {
  const result = await query<{ total: string }>(
    `SELECT COALESCE(SUM(vote_count), 0) AS total FROM posts
     WHERE author_id = $1 AND deleted_at IS NULL`,
    [userId],
  );
  return parseInt(result.rows[0].total, 10);
}

export async function getUserTopTags(userId: string): Promise<TopTagRow[]> {
  const result = await query<{ tag_name: string; vote_sum: string }>(
    `SELECT t.name AS tag_name, SUM(p.vote_count) AS vote_sum
     FROM posts p
     JOIN post_tags pt ON pt.post_id = p.id
     JOIN tags t ON t.id = pt.tag_id
     WHERE p.author_id = $1 AND p.deleted_at IS NULL
     GROUP BY t.name
     ORDER BY vote_sum DESC
     LIMIT 5`,
    [userId],
  );
  return result.rows.map((r) => ({
    tag_name: r.tag_name,
    vote_sum: parseInt(r.vote_sum, 10),
  }));
}

export async function getTopContributors(): Promise<TopContributorRow[]> {
  const result = await query<{ author_id: string; total_votes: string }>(
    `SELECT author_id, SUM(vote_count) AS total_votes
     FROM posts
     WHERE deleted_at IS NULL
     GROUP BY author_id
     HAVING COUNT(*) >= 3 AND SUM(vote_count) >= 5
     ORDER BY total_votes DESC
     LIMIT 3`,
  );
  return result.rows.map((r) => ({
    author_id: r.author_id,
    total_votes: parseInt(r.total_votes, 10),
  }));
}

export async function getTagExperts(userId: string): Promise<TagExpertRow[]> {
  const result = await query<{ tag_name: string }>(
    `WITH user_tag_votes AS (
       SELECT t.id AS tag_id, t.name AS tag_name, SUM(p.vote_count) AS vote_sum,
              COUNT(p.id) AS post_count
       FROM posts p
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.author_id = $1 AND p.deleted_at IS NULL
       GROUP BY t.id, t.name
       HAVING COUNT(p.id) >= 3 AND SUM(p.vote_count) >= 5
     ),
     top_per_tag AS (
       SELECT DISTINCT ON (t.id) t.id AS tag_id, p.author_id
       FROM posts p
       JOIN post_tags pt ON pt.post_id = p.id
       JOIN tags t ON t.id = pt.tag_id
       WHERE p.deleted_at IS NULL
       GROUP BY t.id, p.author_id
       ORDER BY t.id, SUM(p.vote_count) DESC
     )
     SELECT utv.tag_name
     FROM user_tag_votes utv
     JOIN top_per_tag tpt ON tpt.tag_id = utv.tag_id
     WHERE tpt.author_id = $1`,
    [userId],
  );
  return result.rows;
}

export async function getUserPublicPosts(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<UserPublicPostRow[]> {
  const params: unknown[] = [userId, limit];
  let cursorClause = '';

  if (cursor) {
    const [cursorDate, cursorId] = cursor.split('_');
    cursorClause = `AND (p.created_at, p.id) < ($3, $4)`;
    params.push(cursorDate, cursorId);
  }

  const result = await query<UserPublicPostRow>(
    `SELECT p.id, p.title, p.content_type, p.language, p.vote_count, p.created_at,
            STRING_AGG(t.name, ',' ORDER BY t.name) AS tags
     FROM posts p
     LEFT JOIN post_tags pt ON pt.post_id = p.id
     LEFT JOIN tags t ON t.id = pt.tag_id
     WHERE p.author_id = $1 AND p.deleted_at IS NULL
       AND p.visibility = 'public' AND p.is_draft = false
       ${cursorClause}
     GROUP BY p.id
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT $2`,
    params,
  );
  return result.rows;
}
```

- [ ] **Step 4: Add export to barrel**

Add to `packages/server/src/db/queries/index.ts`:

```typescript
export * from './user-profiles.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/user-profiles.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/queries/user-profiles.ts packages/server/src/db/queries/index.ts packages/server/src/__tests__/db/queries/user-profiles.test.ts
git commit -m "feat: add database queries for user profile stats and badges"
```

---

## Task 3: User Profile Service

**Files:**
- Create: `packages/server/src/services/user-profiles.ts`
- Create: `packages/server/src/__tests__/services/user-profiles.test.ts`

- [ ] **Step 1: Write failing tests for the service**

```typescript
// packages/server/src/__tests__/services/user-profiles.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../../db/queries/user-profiles.js';
import { findUserById } from '../../db/queries/users.js';
import {
  buildUserProfile,
  toUserProfilePost,
} from '../../services/user-profiles.js';
import type { UserRow } from '../../db/queries/types.js';
import type { UserPublicPostRow } from '../../db/queries/user-profiles.js';

vi.mock('../../db/queries/user-profiles.js', () => ({
  getUserPostCount: vi.fn(),
  getUserTotalVotes: vi.fn(),
  getUserTopTags: vi.fn(),
  getTopContributors: vi.fn(),
  getTagExperts: vi.fn(),
  getUserPublicPosts: vi.fn(),
}));

vi.mock('../../db/queries/users.js', () => ({
  findUserById: vi.fn(),
}));

const mockFindUserById = findUserById as Mock;
const mockGetUserPostCount = getUserPostCount as Mock;
const mockGetUserTotalVotes = getUserTotalVotes as Mock;
const mockGetUserTopTags = getUserTopTags as Mock;
const mockGetTopContributors = getTopContributors as Mock;
const mockGetTagExperts = getTagExperts as Mock;
const mockGetUserPublicPosts = getUserPublicPosts as Mock;

const userId = '550e8400-e29b-41d4-a716-446655440000';

const sampleUserRow: UserRow = {
  id: userId,
  email: 'alice@example.com',
  display_name: 'Alice',
  avatar_url: 'https://example.com/alice.jpg',
  auth_provider: 'local',
  password_hash: '$2b$12$hashed',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('user-profiles service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toUserProfilePost', () => {
    it('transforms a UserPublicPostRow to UserProfilePost', () => {
      const row: UserPublicPostRow = {
        id: 'post-1',
        title: 'My Post',
        content_type: 'snippet',
        language: 'typescript',
        vote_count: 5,
        created_at: new Date('2026-01-15'),
        tags: 'typescript,react',
      };
      const result = toUserProfilePost(row);
      expect(result).toEqual({
        id: 'post-1',
        title: 'My Post',
        contentType: 'snippet',
        language: 'typescript',
        voteCount: 5,
        createdAt: new Date('2026-01-15').toISOString(),
        tags: ['typescript', 'react'],
      });
    });

    it('handles null tags as empty array', () => {
      const row: UserPublicPostRow = {
        id: 'post-1',
        title: 'No Tags',
        content_type: 'snippet',
        language: null,
        vote_count: 0,
        created_at: new Date('2026-01-15'),
        tags: null,
      };
      const result = toUserProfilePost(row);
      expect(result.tags).toEqual([]);
    });
  });

  describe('buildUserProfile', () => {
    it('returns null when user not found', async () => {
      mockFindUserById.mockResolvedValue(null);
      const result = await buildUserProfile(userId, 20);
      expect(result).toBeNull();
    });

    it('assembles full profile with stats and badges', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(10);
      mockGetUserTotalVotes.mockResolvedValue(42);
      mockGetUserTopTags.mockResolvedValue([
        { tag_name: 'typescript', vote_sum: 20 },
      ]);
      mockGetTopContributors.mockResolvedValue([
        { author_id: userId, total_votes: 100 },
        { author_id: 'other-1', total_votes: 80 },
        { author_id: 'other-2', total_votes: 60 },
      ]);
      mockGetTagExperts.mockResolvedValue([{ tag_name: 'typescript' }]);
      mockGetUserPublicPosts.mockResolvedValue([
        {
          id: 'post-1',
          title: 'My Post',
          content_type: 'snippet',
          language: 'typescript',
          vote_count: 5,
          created_at: new Date('2026-01-15'),
          tags: 'typescript',
        },
      ]);

      const result = await buildUserProfile(userId, 20);

      expect(result).not.toBeNull();
      expect(result!.user.displayName).toBe('Alice');
      expect(result!.user.avatarUrl).toBe('https://example.com/alice.jpg');
      expect(result!.stats.postCount).toBe(10);
      expect(result!.stats.totalVotes).toBe(42);
      expect(result!.stats.topTags).toEqual([
        { tagName: 'typescript', voteSum: 20 },
      ]);
      expect(result!.badges).toEqual([
        { type: 'top_contributor', label: '#1 Contributor', rank: 1 },
        { type: 'tag_expert', label: 'Expert in typescript' },
      ]);
      expect(result!.posts).toHaveLength(1);
    });

    it('assigns correct rank to top contributors', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(0);
      mockGetUserTotalVotes.mockResolvedValue(0);
      mockGetUserTopTags.mockResolvedValue([]);
      mockGetTopContributors.mockResolvedValue([
        { author_id: 'other-1', total_votes: 100 },
        { author_id: userId, total_votes: 80 },
        { author_id: 'other-2', total_votes: 60 },
      ]);
      mockGetTagExperts.mockResolvedValue([]);
      mockGetUserPublicPosts.mockResolvedValue([]);

      const result = await buildUserProfile(userId, 20);
      expect(result!.badges).toEqual([
        { type: 'top_contributor', label: '#2 Contributor', rank: 2 },
      ]);
    });

    it('returns no badges when user is not top contributor or tag expert', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(1);
      mockGetUserTotalVotes.mockResolvedValue(2);
      mockGetUserTopTags.mockResolvedValue([]);
      mockGetTopContributors.mockResolvedValue([
        { author_id: 'other-1', total_votes: 100 },
        { author_id: 'other-2', total_votes: 80 },
        { author_id: 'other-3', total_votes: 60 },
      ]);
      mockGetTagExperts.mockResolvedValue([]);
      mockGetUserPublicPosts.mockResolvedValue([]);

      const result = await buildUserProfile(userId, 20);
      expect(result!.badges).toEqual([]);
    });

    it('builds cursor from last post', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(1);
      mockGetUserTotalVotes.mockResolvedValue(5);
      mockGetUserTopTags.mockResolvedValue([]);
      mockGetTopContributors.mockResolvedValue([]);
      mockGetTagExperts.mockResolvedValue([]);
      const postDate = new Date('2026-01-15');
      mockGetUserPublicPosts.mockResolvedValue([
        {
          id: 'post-1',
          title: 'Post',
          content_type: 'snippet',
          language: null,
          vote_count: 5,
          created_at: postDate,
          tags: null,
        },
      ]);

      const result = await buildUserProfile(userId, 1);
      expect(result!.cursor).toBe(`${postDate.toISOString()}_post-1`);
    });

    it('returns null cursor when fewer posts than limit', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(1);
      mockGetUserTotalVotes.mockResolvedValue(5);
      mockGetUserTopTags.mockResolvedValue([]);
      mockGetTopContributors.mockResolvedValue([]);
      mockGetTagExperts.mockResolvedValue([]);
      mockGetUserPublicPosts.mockResolvedValue([
        {
          id: 'post-1',
          title: 'Post',
          content_type: 'snippet',
          language: null,
          vote_count: 5,
          created_at: new Date('2026-01-15'),
          tags: null,
        },
      ]);

      const result = await buildUserProfile(userId, 20);
      expect(result!.cursor).toBeNull();
    });

    it('passes cursor through to getUserPublicPosts', async () => {
      mockFindUserById.mockResolvedValue(sampleUserRow);
      mockGetUserPostCount.mockResolvedValue(0);
      mockGetUserTotalVotes.mockResolvedValue(0);
      mockGetUserTopTags.mockResolvedValue([]);
      mockGetTopContributors.mockResolvedValue([]);
      mockGetTagExperts.mockResolvedValue([]);
      mockGetUserPublicPosts.mockResolvedValue([]);

      await buildUserProfile(userId, 20, 'some-cursor');
      expect(mockGetUserPublicPosts).toHaveBeenCalledWith(userId, 20, 'some-cursor');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/services/user-profiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

```typescript
// packages/server/src/services/user-profiles.ts
import { findUserById } from '../db/queries/users.js';
import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../db/queries/user-profiles.js';
import type { UserPublicPostRow } from '../db/queries/user-profiles.js';
import type {
  UserProfileResponse,
  UserProfileBadge,
  UserProfilePost,
} from '@forge/shared';

export function toUserProfilePost(row: UserPublicPostRow): UserProfilePost {
  return {
    id: row.id,
    title: row.title,
    contentType: row.content_type,
    language: row.language,
    voteCount: row.vote_count,
    createdAt: row.created_at.toISOString(),
    tags: row.tags ? row.tags.split(',') : [],
  };
}

export async function buildUserProfile(
  userId: string,
  limit: number,
  cursor?: string,
): Promise<UserProfileResponse | null> {
  const userRow = await findUserById(userId);
  if (!userRow) return null;

  const [postCount, totalVotes, topTagRows, topContributors, tagExpertRows, postRows] =
    await Promise.all([
      getUserPostCount(userId),
      getUserTotalVotes(userId),
      getUserTopTags(userId),
      getTopContributors(),
      getTagExperts(userId),
      getUserPublicPosts(userId, limit, cursor),
    ]);

  // Build badges
  const badges: UserProfileBadge[] = [];

  const contributorIndex = topContributors.findIndex((c) => c.author_id === userId);
  if (contributorIndex !== -1) {
    const rank = contributorIndex + 1;
    badges.push({
      type: 'top_contributor',
      label: `#${String(rank)} Contributor`,
      rank,
    });
  }

  for (const row of tagExpertRows) {
    badges.push({
      type: 'tag_expert',
      label: `Expert in ${row.tag_name}`,
    });
  }

  const posts = postRows.map(toUserProfilePost);
  const lastPost = postRows[postRows.length - 1];
  const nextCursor =
    postRows.length >= limit && lastPost
      ? `${lastPost.created_at.toISOString()}_${lastPost.id}`
      : null;

  return {
    user: {
      id: userRow.id,
      displayName: userRow.display_name,
      avatarUrl: userRow.avatar_url,
      createdAt: userRow.created_at.toISOString(),
    },
    stats: {
      postCount,
      totalVotes,
      topTags: topTagRows.map((t) => ({ tagName: t.tag_name, voteSum: t.vote_sum })),
    },
    badges,
    posts,
    cursor: nextCursor,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/services/user-profiles.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/user-profiles.ts packages/server/src/__tests__/services/user-profiles.test.ts
git commit -m "feat: add user profile service with stats and badge computation"
```

---

## Task 4: User Profile Route

**Files:**
- Create: `packages/server/src/routes/user-profiles.ts`
- Create: `packages/server/src/__tests__/routes/user-profiles.test.ts`
- Modify: `packages/server/src/app.ts`

- [ ] **Step 1: Write failing tests for the route**

```typescript
// packages/server/src/__tests__/routes/user-profiles.test.ts
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, type Mock } from 'vitest';
import { buildApp } from '../../app.js';
import type { FastifyInstance } from 'fastify';
import { buildUserProfile } from '../../services/user-profiles.js';
import type { UserProfileResponse } from '@forge/shared';

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
}));

vi.mock('../../services/user-profiles.js', () => ({
  buildUserProfile: vi.fn(),
}));

vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {},
}));

vi.mock('../../plugins/langchain/index.js', () => ({
  langchainPlugin: async () => {},
}));

vi.mock('../../plugins/websocket/index.js', () => ({
  websocketPlugin: async () => {},
}));

vi.mock('../../db/queries/post-files.js', () => ({
  cleanupStagedFiles: vi.fn().mockResolvedValue(0),
}));

const mockBuildUserProfile = buildUserProfile as Mock;

let app: FastifyInstance;

const sampleProfile: UserProfileResponse = {
  user: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    displayName: 'Alice',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  stats: { postCount: 5, totalVotes: 42, topTags: [] },
  badges: [{ type: 'top_contributor', label: '#1 Contributor', rank: 1 }],
  posts: [],
  cursor: null,
};

describe('GET /api/users/:id', () => {
  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with user profile', async () => {
    mockBuildUserProfile.mockResolvedValue(sampleProfile);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.displayName).toBe('Alice');
    expect(body.stats.postCount).toBe(5);
    expect(body.badges).toHaveLength(1);
  });

  it('returns 400 for invalid UUID', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/users/not-a-uuid',
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeDefined();
  });

  it('returns 404 when user not found', async () => {
    mockBuildUserProfile.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('User not found');
  });

  it('accepts limit and cursor query params', async () => {
    mockBuildUserProfile.mockResolvedValue(sampleProfile);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/550e8400-e29b-41d4-a716-446655440000?limit=10&cursor=abc_123',
    });

    expect(res.statusCode).toBe(200);
    expect(mockBuildUserProfile).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      10,
      'abc_123',
    );
  });

  it('defaults limit to 20', async () => {
    mockBuildUserProfile.mockResolvedValue(sampleProfile);

    await app.inject({
      method: 'GET',
      url: '/api/users/550e8400-e29b-41d4-a716-446655440000',
    });

    expect(mockBuildUserProfile).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      20,
      undefined,
    );
  });

  it('clamps limit to 1-50', async () => {
    mockBuildUserProfile.mockResolvedValue(sampleProfile);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/550e8400-e29b-41d4-a716-446655440000?limit=100',
    });

    expect(res.statusCode).toBe(200);
    expect(mockBuildUserProfile).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
      50,
      undefined,
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/routes/user-profiles.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

```typescript
// packages/server/src/routes/user-profiles.ts
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildUserProfile } from '../services/user-profiles.js';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const paramsSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid user ID'),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export async function userProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get('/:id', async (request, reply) => {
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply
        .status(400)
        .send({ error: paramsParsed.error.errors.map((e) => e.message).join(', ') });
    }

    const queryParsed = querySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply
        .status(400)
        .send({ error: queryParsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { id } = paramsParsed.data;
    const { limit, cursor } = queryParsed.data;

    const profile = await buildUserProfile(id, limit, cursor);
    if (!profile) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(profile);
  });
}
```

- [ ] **Step 4: Register the route in app.ts**

Add import and registration to `packages/server/src/app.ts`:

Import line (add after existing route imports):
```typescript
import { userProfileRoutes } from './routes/user-profiles.js';
```

Registration (add after existing route registrations, before the `onReady` hook):
```typescript
  await app.register(userProfileRoutes, { prefix: '/api/users' });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/routes/user-profiles.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 6: Run full server test suite**

Run: `cd packages/server && npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/user-profiles.ts packages/server/src/__tests__/routes/user-profiles.test.ts packages/server/src/app.ts
git commit -m "feat: add GET /api/users/:id endpoint with stats and badges"
```

---

## Task 5: UserBadge Component

**Files:**
- Create: `packages/client/src/components/user/UserBadge.vue`
- Create: `packages/client/src/__tests__/components/user/UserBadge.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/components/user/UserBadge.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserBadge from '../../../components/user/UserBadge.vue';
import type { UserProfileBadge } from '@forge/shared';

describe('UserBadge', () => {
  it('renders top contributor badge with rank', () => {
    const badge: UserProfileBadge = {
      type: 'top_contributor',
      label: '#1 Contributor',
      rank: 1,
    };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.text()).toContain('#1 Contributor');
    expect(wrapper.find('[data-testid="badge-star"]').exists()).toBe(true);
  });

  it('uses gold color for rank 1', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#1 Contributor', rank: 1 };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.find('[data-testid="badge-star"]').classes()).toContain('text-yellow-400');
  });

  it('uses silver color for rank 2', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#2 Contributor', rank: 2 };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.find('[data-testid="badge-star"]').classes()).toContain('text-gray-300');
  });

  it('uses bronze color for rank 3', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#3 Contributor', rank: 3 };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.find('[data-testid="badge-star"]').classes()).toContain('text-amber-600');
  });

  it('renders tag expert badge', () => {
    const badge: UserProfileBadge = { type: 'tag_expert', label: 'Expert in typescript' };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.text()).toContain('Expert in typescript');
    expect(wrapper.find('[data-testid="badge-tag"]').exists()).toBe(true);
  });

  it('shows tooltip on hover with title attribute', () => {
    const badge: UserProfileBadge = { type: 'top_contributor', label: '#1 Contributor', rank: 1 };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.attributes('title')).toContain('Top 3');
  });

  it('shows tag expert tooltip', () => {
    const badge: UserProfileBadge = { type: 'tag_expert', label: 'Expert in typescript' };
    const wrapper = mount(UserBadge, { props: { badge } });
    expect(wrapper.attributes('title')).toContain('top contributor');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/user/UserBadge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement UserBadge component**

```vue
<!-- packages/client/src/components/user/UserBadge.vue -->
<template>
  <span
    class="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium"
    :class="pillClasses"
    :title="tooltip"
  >
    <!-- Star icon for top contributor -->
    <svg
      v-if="badge.type === 'top_contributor'"
      data-testid="badge-star"
      class="h-3.5 w-3.5"
      :class="iconColor"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
      />
    </svg>
    <!-- Tag icon for tag expert -->
    <svg
      v-if="badge.type === 'tag_expert'"
      data-testid="badge-tag"
      class="h-3.5 w-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
      />
    </svg>
    {{ badge.label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { UserProfileBadge } from '@forge/shared';

const props = defineProps<{ badge: UserProfileBadge }>();

const rankColors: Record<number, string> = {
  1: 'text-yellow-400',
  2: 'text-gray-300',
  3: 'text-amber-600',
};

const iconColor = computed(() =>
  props.badge.type === 'top_contributor' && props.badge.rank
    ? rankColors[props.badge.rank] ?? 'text-yellow-400'
    : '',
);

const pillClasses = computed(() =>
  props.badge.type === 'top_contributor'
    ? 'bg-yellow-400/10 text-yellow-300'
    : 'bg-primary/10 text-primary',
);

const tooltip = computed(() =>
  props.badge.type === 'top_contributor'
    ? 'Top 3 contributor by total votes received'
    : 'This user is the top contributor for this tag',
);
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/user/UserBadge.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/user/UserBadge.vue packages/client/src/__tests__/components/user/UserBadge.test.ts
git commit -m "feat: add UserBadge component with rank colors and tooltips"
```

---

## Task 6: UserStats Component

**Files:**
- Create: `packages/client/src/components/user/UserStats.vue`
- Create: `packages/client/src/__tests__/components/user/UserStats.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/client/src/__tests__/components/user/UserStats.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import UserStats from '../../../components/user/UserStats.vue';
import type { UserProfileStats } from '@forge/shared';

describe('UserStats', () => {
  const baseStats: UserProfileStats = {
    postCount: 42,
    totalVotes: 128,
    topTags: [
      { tagName: 'typescript', voteSum: 50 },
      { tagName: 'react', voteSum: 30 },
    ],
  };

  it('displays post count', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });
    expect(wrapper.find('[data-testid="stat-posts"]').text()).toContain('42');
    expect(wrapper.find('[data-testid="stat-posts"]').text()).toContain('Posts');
  });

  it('displays total votes', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });
    expect(wrapper.find('[data-testid="stat-votes"]').text()).toContain('128');
    expect(wrapper.find('[data-testid="stat-votes"]').text()).toContain('Votes');
  });

  it('displays top tags with vote counts', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });
    const tagSection = wrapper.find('[data-testid="stat-tags"]');
    expect(tagSection.text()).toContain('typescript');
    expect(tagSection.text()).toContain('50');
    expect(tagSection.text()).toContain('react');
    expect(tagSection.text()).toContain('30');
  });

  it('shows empty state when no top tags', () => {
    const stats: UserProfileStats = { postCount: 0, totalVotes: 0, topTags: [] };
    const wrapper = mount(UserStats, { props: { stats } });
    const tagSection = wrapper.find('[data-testid="stat-tags"]');
    expect(tagSection.text()).toContain('No tags yet');
  });

  it('renders all three stat cards', () => {
    const wrapper = mount(UserStats, { props: { stats: baseStats } });
    expect(wrapper.findAll('[data-testid^="stat-"]')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/user/UserStats.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement UserStats component**

```vue
<!-- packages/client/src/components/user/UserStats.vue -->
<template>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
    <!-- Posts count -->
    <div data-testid="stat-posts" class="rounded-lg bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <span class="text-xs">Posts</span>
      </div>
      <div class="mt-1 text-2xl font-bold text-white">{{ stats.postCount }}</div>
    </div>

    <!-- Total votes -->
    <div data-testid="stat-votes" class="rounded-lg bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
        </svg>
        <span class="text-xs">Votes Received</span>
      </div>
      <div class="mt-1 text-2xl font-bold text-white">{{ stats.totalVotes }}</div>
    </div>

    <!-- Top tags -->
    <div data-testid="stat-tags" class="rounded-lg bg-gray-800 p-4">
      <div class="flex items-center gap-2 text-gray-400">
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z"
          />
        </svg>
        <span class="text-xs">Top Tags</span>
      </div>
      <div v-if="stats.topTags.length > 0" class="mt-2 flex flex-wrap gap-1">
        <span
          v-for="tag in stats.topTags"
          :key="tag.tagName"
          class="inline-flex items-center gap-1 rounded bg-gray-700 px-2 py-0.5 text-xs text-gray-300"
        >
          #{{ tag.tagName }}
          <span class="text-gray-500">{{ tag.voteSum }}</span>
        </span>
      </div>
      <div v-else class="mt-2 text-sm text-gray-500">No tags yet</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UserProfileStats } from '@forge/shared';

defineProps<{ stats: UserProfileStats }>();
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/user/UserStats.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/user/UserStats.vue packages/client/src/__tests__/components/user/UserStats.test.ts
git commit -m "feat: add UserStats component with post count, votes, and top tags cards"
```

---

## Task 7: useUserProfile Composable + UserProfilePage

**Files:**
- Create: `packages/client/src/composables/useUserProfile.ts`
- Create: `packages/client/src/__tests__/composables/useUserProfile.test.ts`
- Create: `packages/client/src/pages/UserProfilePage.vue`
- Create: `packages/client/src/__tests__/pages/UserProfilePage.test.ts`
- Modify: `packages/client/src/plugins/router.ts`

- [ ] **Step 1: Write failing tests for the composable**

```typescript
// packages/client/src/__tests__/composables/useUserProfile.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { apiFetch } from '../../lib/api.js';
import { useUserProfile } from '../../composables/useUserProfile.js';
import type { UserProfileResponse } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as Mock;

const sampleProfile: UserProfileResponse = {
  user: {
    id: 'user-1',
    displayName: 'Alice',
    avatarUrl: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  stats: { postCount: 5, totalVotes: 42, topTags: [] },
  badges: [],
  posts: [
    {
      id: 'post-1',
      title: 'My Post',
      contentType: 'snippet',
      language: 'typescript',
      voteCount: 5,
      createdAt: '2026-01-15T00:00:00.000Z',
      tags: ['typescript'],
    },
  ],
  cursor: null,
};

describe('useUserProfile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches user profile successfully', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const { profile, loading, error, fetchProfile } = useUserProfile();
    expect(loading.value).toBe(false);

    await fetchProfile('user-1');

    expect(loading.value).toBe(false);
    expect(error.value).toBeNull();
    expect(profile.value).toEqual(sampleProfile);
    expect(mockApiFetch).toHaveBeenCalledWith('/api/users/user-1?limit=20');
  });

  it('sets error on failed fetch', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'User not found' }),
    });

    const { profile, error, fetchProfile } = useUserProfile();
    await fetchProfile('bad-id');

    expect(error.value).toBe('User not found');
    expect(profile.value).toBeNull();
  });

  it('handles network error', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const { error, fetchProfile } = useUserProfile();
    await fetchProfile('user-1');

    expect(error.value).toBe('Network error');
  });

  it('loads more posts with cursor', async () => {
    const profileWithCursor: UserProfileResponse = {
      ...sampleProfile,
      cursor: '2026-01-15T00:00:00.000Z_post-1',
    };

    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(profileWithCursor),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            ...sampleProfile,
            posts: [
              {
                id: 'post-2',
                title: 'Older Post',
                contentType: 'snippet',
                language: null,
                voteCount: 2,
                createdAt: '2026-01-10T00:00:00.000Z',
                tags: [],
              },
            ],
            cursor: null,
          }),
      });

    const { profile, fetchProfile, loadMore } = useUserProfile();
    await fetchProfile('user-1');
    expect(profile.value!.posts).toHaveLength(1);

    await loadMore();
    expect(profile.value!.posts).toHaveLength(2);
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      '/api/users/user-1?limit=20&cursor=2026-01-15T00%3A00%3A00.000Z_post-1',
    );
  });

  it('does not load more when no cursor', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const { fetchProfile, loadMore } = useUserProfile();
    await fetchProfile('user-1');
    await loadMore();

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/composables/useUserProfile.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the composable**

```typescript
// packages/client/src/composables/useUserProfile.ts
import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import type { UserProfileResponse } from '@forge/shared';

export function useUserProfile() {
  const profile = ref<UserProfileResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let currentUserId: string | null = null;

  async function fetchProfile(userId: string): Promise<void> {
    currentUserId = userId;
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/users/${userId}?limit=20`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load profile';
        profile.value = null;
        return;
      }
      profile.value = (await response.json()) as UserProfileResponse;
    } catch {
      error.value = 'Network error';
      profile.value = null;
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!profile.value?.cursor || !currentUserId) return;
    loading.value = true;
    error.value = null;
    try {
      const cursor = encodeURIComponent(profile.value.cursor);
      const response = await apiFetch(
        `/api/users/${currentUserId}?limit=20&cursor=${cursor}`,
      );
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        error.value = data.error ?? 'Failed to load more posts';
        return;
      }
      const data = (await response.json()) as UserProfileResponse;
      profile.value = {
        ...profile.value,
        posts: [...profile.value.posts, ...data.posts],
        cursor: data.cursor,
      };
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  return { profile, loading, error, fetchProfile, loadMore };
}
```

- [ ] **Step 4: Run composable tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/composables/useUserProfile.test.ts`
Expected: All 5 tests PASS

- [ ] **Step 5: Write failing tests for UserProfilePage**

```typescript
// packages/client/src/__tests__/pages/UserProfilePage.test.ts
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserProfilePage from '../../pages/UserProfilePage.vue';
import { apiFetch } from '../../lib/api.js';
import type { UserProfileResponse } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as Mock;

const sampleProfile: UserProfileResponse = {
  user: {
    id: 'user-1',
    displayName: 'Alice',
    avatarUrl: 'https://example.com/alice.jpg',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  stats: {
    postCount: 5,
    totalVotes: 42,
    topTags: [{ tagName: 'typescript', voteSum: 20 }],
  },
  badges: [
    { type: 'top_contributor', label: '#1 Contributor', rank: 1 },
    { type: 'tag_expert', label: 'Expert in typescript' },
  ],
  posts: [
    {
      id: 'post-1',
      title: 'My Post',
      contentType: 'snippet',
      language: 'typescript',
      voteCount: 5,
      createdAt: '2026-01-15T00:00:00.000Z',
      tags: ['typescript'],
    },
  ],
  cursor: null,
};

async function mountPage(userId = 'user-1') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/user/:id', name: 'user-profile', component: UserProfilePage },
      { path: '/posts/:id', name: 'post-view', component: { template: '<div />' } },
    ],
  });

  await router.push(`/user/${userId}`);
  await router.isReady();

  return mount(UserProfilePage, {
    global: { plugins: [router] },
  });
}

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('displays user info after loading', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.find('[data-testid="user-avatar"]').exists()).toBe(true);
  });

  it('displays badges', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('#1 Contributor');
    expect(wrapper.text()).toContain('Expert in typescript');
  });

  it('displays stats cards', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="stat-posts"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stat-votes"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="stat-tags"]').exists()).toBe(true);
  });

  it('displays user posts', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('My Post');
  });

  it('shows error state when fetch fails', async () => {
    mockApiFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'User not found' }),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('User not found');
  });

  it('shows loading state initially', async () => {
    let resolvePromise: (v: unknown) => void;
    mockApiFetch.mockReturnValue(
      new Promise((r) => {
        resolvePromise = r;
      }),
    );

    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);

    resolvePromise!({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });
  });

  it('shows joined date formatted', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(sampleProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.text()).toContain('Joined');
  });

  it('renders avatar initial when no avatar URL', async () => {
    const noAvatarProfile = {
      ...sampleProfile,
      user: { ...sampleProfile.user, avatarUrl: null },
    };
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(noAvatarProfile),
    });

    const wrapper = await mountPage();
    await vi.dynamicImportSettled();

    expect(wrapper.find('[data-testid="user-avatar"]').text()).toContain('A');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/pages/UserProfilePage.test.ts`
Expected: FAIL — module not found

- [ ] **Step 7: Implement UserProfilePage**

```vue
<!-- packages/client/src/pages/UserProfilePage.vue -->
<template>
  <div class="mx-auto max-w-4xl p-6">
    <!-- Loading state -->
    <div v-if="loading && !profile" data-testid="loading" class="flex justify-center py-12">
      <div class="text-gray-400">Loading profile...</div>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="rounded-lg bg-red-900/20 p-6 text-center text-red-400">
      {{ error }}
    </div>

    <!-- Profile content -->
    <template v-else-if="profile">
      <!-- Header: avatar, name, badges, join date -->
      <div class="mb-6 flex items-start gap-4">
        <div
          data-testid="user-avatar"
          class="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 text-2xl font-bold text-primary"
        >
          <img
            v-if="profile.user.avatarUrl"
            :src="profile.user.avatarUrl"
            :alt="profile.user.displayName"
            class="h-16 w-16 rounded-full object-cover"
          />
          <span v-else>{{ profile.user.displayName[0]?.toUpperCase() }}</span>
        </div>
        <div class="flex-1">
          <h1 class="text-2xl font-bold text-white">{{ profile.user.displayName }}</h1>
          <div class="mt-1 text-sm text-gray-400">
            Joined {{ formatDate(profile.user.createdAt) }}
          </div>
          <div v-if="profile.badges.length > 0" class="mt-2 flex flex-wrap gap-2">
            <UserBadge v-for="(badge, i) in profile.badges" :key="i" :badge="badge" />
          </div>
        </div>
      </div>

      <!-- Stats -->
      <UserStats :stats="profile.stats" class="mb-6" />

      <!-- Posts list -->
      <div>
        <h2 class="mb-3 text-lg font-semibold text-white">Public Posts</h2>
        <div v-if="profile.posts.length === 0" class="text-sm text-gray-500">
          No public posts yet.
        </div>
        <div v-else class="space-y-2">
          <RouterLink
            v-for="post in profile.posts"
            :key="post.id"
            :to="{ name: 'post-view', params: { id: post.id } }"
            class="block rounded-lg border border-gray-700 p-4 transition-colors hover:bg-gray-800"
          >
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-medium text-gray-100">{{ post.title }}</h3>
              <span class="flex items-center gap-1 text-xs text-gray-500">
                <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M5 15l7-7 7 7"
                  />
                </svg>
                {{ post.voteCount }}
              </span>
            </div>
            <div class="mt-1 flex items-center gap-2 text-xs text-gray-500">
              <span class="rounded bg-gray-700 px-1.5 py-0.5">{{ post.contentType }}</span>
              <span v-if="post.language">{{ post.language }}</span>
              <span>{{ timeAgo(post.createdAt) }}</span>
            </div>
            <div v-if="post.tags.length > 0" class="mt-1 flex flex-wrap gap-1">
              <span
                v-for="tag in post.tags"
                :key="tag"
                class="rounded bg-gray-700 px-1.5 py-0.5 text-xs text-gray-400"
              >
                #{{ tag }}
              </span>
            </div>
          </RouterLink>
        </div>

        <!-- Load more -->
        <button
          v-if="profile.cursor"
          class="mt-4 w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-800"
          :disabled="loading"
          @click="loadMore"
        >
          {{ loading ? 'Loading...' : 'Load more' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { useUserProfile } from '../composables/useUserProfile.js';
import UserBadge from '../components/user/UserBadge.vue';
import UserStats from '../components/user/UserStats.vue';

const route = useRoute();
const { profile, loading, error, fetchProfile, loadMore } = useUserProfile();

watch(
  () => route.params.id as string,
  (id) => {
    if (id) fetchProfile(id);
  },
  { immediate: true },
);

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
</script>
```

- [ ] **Step 8: Add route to router**

Add the `user/:id` route to `packages/client/src/plugins/router.ts` inside the AppLayout children array, after the `search` route:

```typescript
        {
          path: 'user/:id',
          name: 'user-profile',
          component: () => import('@/pages/UserProfilePage.vue'),
        },
```

- [ ] **Step 9: Run all page and composable tests**

Run: `cd packages/client && npx vitest run src/__tests__/composables/useUserProfile.test.ts src/__tests__/pages/UserProfilePage.test.ts`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/composables/useUserProfile.ts packages/client/src/__tests__/composables/useUserProfile.test.ts packages/client/src/pages/UserProfilePage.vue packages/client/src/__tests__/pages/UserProfilePage.test.ts packages/client/src/plugins/router.ts
git commit -m "feat: add UserProfilePage with composable and routing"
```

---

## Task 8: Clickable Avatars

**Files:**
- Modify: `packages/client/src/components/post/PostListItem.vue`
- Modify: `packages/client/src/components/post/PostMetaHeader.vue`
- Modify: `packages/client/src/components/post/CommentThread.vue`
- Modify: `packages/client/src/components/history/RevisionTimeline.vue`
- Modify: existing test files for these components

- [ ] **Step 1: Update PostListItem — wrap avatar in RouterLink**

In `packages/client/src/components/post/PostListItem.vue`, the avatar and author name (lines 8-14) should be wrapped in a `RouterLink`. The click should navigate to the profile and stop propagation so it doesn't trigger the parent's `handleClick`.

Replace the avatar+name `div` in the template (lines 8-14):

```vue
      <RouterLink
        :to="{ name: 'user-profile', params: { id: post.author.id } }"
        class="flex items-center gap-2"
        @click.stop
      >
        <div
          class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/20 text-xs text-primary"
        >
          {{ post.author.displayName[0]?.toUpperCase() }}
        </div>
        <span class="text-xs text-gray-400 hover:text-gray-200">{{ post.author.displayName }}</span>
      </RouterLink>
```

Add `RouterLink` import in the script section:

```typescript
import { RouterLink, useRouter } from 'vue-router';
```

- [ ] **Step 2: Update PostMetaHeader — wrap avatar in RouterLink**

In `packages/client/src/components/post/PostMetaHeader.vue`, wrap the avatar and author name section (lines 4-13) in a `RouterLink`:

```vue
    <RouterLink
      :to="{ name: 'user-profile', params: { id: post.author.id } }"
      class="flex items-center gap-3"
    >
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-bold text-primary"
      >
        {{ post.author.displayName[0]?.toUpperCase() }}
      </div>
      <div>
        <div class="text-sm font-medium text-gray-200 hover:text-white">
          {{ post.author.displayName }}
        </div>
        <div class="text-xs text-gray-500">Updated {{ timeAgo(post.updatedAt) }}</div>
      </div>
    </RouterLink>
```

(`RouterLink` is already imported in PostMetaHeader.)

- [ ] **Step 3: Update CommentThread — wrap author name in RouterLink**

In `packages/client/src/components/post/CommentThread.vue`, wrap the author display name (line 7) in a `RouterLink`:

```vue
          <RouterLink
            v-if="node.author"
            :to="{ name: 'user-profile', params: { id: node.author.id } }"
            class="font-medium text-gray-300 hover:text-white"
          >
            {{ node.author.displayName }}
          </RouterLink>
          <span v-else class="font-medium text-gray-300">Deleted user</span>
```

Add `RouterLink` import:

```typescript
import { RouterLink } from 'vue-router';
```

- [ ] **Step 4: Update RevisionTimeline — wrap avatar+name in RouterLink**

In `packages/client/src/components/history/RevisionTimeline.vue`, wrap the author avatar (lines 19-30) and the author name (line 49) in a `RouterLink`. The `PostRevision` type already has `authorId`.

Replace the author avatar `div` (lines 19-30) with:

```vue
      <RouterLink
        v-if="rev.authorId"
        :to="{ name: 'user-profile', params: { id: rev.authorId } }"
        class="flex-shrink-0"
        @click.stop
      >
        <div
          data-testid="author-avatar"
          class="flex h-7 w-7 items-center justify-center rounded-full bg-gray-600 text-xs text-gray-200"
        >
          <img
            v-if="rev.authorAvatarUrl"
            :src="rev.authorAvatarUrl"
            :alt="rev.authorDisplayName ?? 'Author'"
            class="h-full w-full rounded-full object-cover"
          />
          <template v-else>{{ getInitials(rev.authorDisplayName) }}</template>
        </div>
      </RouterLink>
      <div
        v-else
        data-testid="author-avatar"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 text-xs text-gray-200"
      >
        {{ getInitials(rev.authorDisplayName) }}
      </div>
```

Replace the author name paragraph (line 49) with:

```vue
        <RouterLink
          v-if="rev.authorId"
          :to="{ name: 'user-profile', params: { id: rev.authorId } }"
          class="mt-0.5 text-xs text-gray-400 hover:text-gray-200"
          @click.stop
        >
          {{ rev.authorDisplayName ?? 'Unknown' }}
        </RouterLink>
        <p v-else class="mt-0.5 text-xs text-gray-400">
          {{ rev.authorDisplayName ?? 'Unknown' }}
        </p>
```

Add `RouterLink` import:

```typescript
import { RouterLink } from 'vue-router';
```

- [ ] **Step 5: Update existing tests to provide router with user-profile route**

Tests for PostListItem, PostMetaHeader, CommentThread, and RevisionTimeline that mount these components need the router to include the `user-profile` route. Update each test's router setup (or `global.stubs`) to include:

```typescript
{ path: '/user/:id', name: 'user-profile', component: { template: '<div />' } }
```

Or stub `RouterLink` for tests that don't need navigation:

```typescript
global: { stubs: { RouterLink: true } }
```

- [ ] **Step 6: Run affected component tests**

Run: `cd packages/client && npx vitest run src/__tests__/components/post/ src/__tests__/components/history/`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/post/PostListItem.vue packages/client/src/components/post/PostMetaHeader.vue packages/client/src/components/post/CommentThread.vue packages/client/src/components/history/RevisionTimeline.vue
git add packages/client/src/__tests__/components/post/ packages/client/src/__tests__/components/history/
git commit -m "feat: make user avatars clickable links to profile page"
```

---

## Task 9: Bruno API Tests

**Files:**
- Create: `bruno/users/get-user-profile.bru`
- Create: `bruno/users/get-user-profile-not-found.bru`

- [ ] **Step 1: Create Bruno directory and add testuser env variable**

```bash
mkdir -p bruno/users
```

Add `testuser` variable to `bruno/environments/local.bru` (after the `createdLinkPostId` line):

```
  testuser: a0000000-0000-0000-0000-000000000099
```

Also add to `bruno/environments/ci.bru` if it exists, using the same value.

- [ ] **Step 2: Create happy-path test**

```bru
# bruno/users/get-user-profile.bru
meta {
  name: Get User Profile
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/api/users/{{testuser}}
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 200
  res.body.user.id: eq {{testuser}}
  res.body.stats.postCount: isNumber
  res.body.stats.totalVotes: isNumber
  res.body.posts: isArray
}
```

- [ ] **Step 3: Create 404 test**

```bru
# bruno/users/get-user-profile-not-found.bru
meta {
  name: Get User Profile - Not Found
  type: http
  seq: 2
}

get {
  url: {{baseUrl}}/api/users/00000000-0000-0000-0000-000000000000
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 404
  res.body.error: eq User not found
}
```

- [ ] **Step 4: Run Bruno tests against running server**

Run: `cd bruno && npx @usebruno/cli run users --env local`
Expected: Both requests pass with asserted status codes

- [ ] **Step 5: Commit**

```bash
git add bruno/users/ bruno/environments/local.bru
git commit -m "test(bruno): add API tests for user profile endpoint"
```

---

## Task 10: Coverage Verification & Cleanup

**Files:** No new files — verification only

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass across server and client packages

- [ ] **Step 2: Run coverage check**

Run: `npm run test:coverage`
Expected: 100% lines, branches, functions, statements (matches `.coverage-thresholds.json`)

- [ ] **Step 3: Fix any coverage gaps**

If any uncovered branches or lines are found, add targeted tests. Common gaps:
- Unreachable default branches (remove if unreachable)
- Error handling paths (add tests that trigger them)
- Edge cases in date formatting or null handling

- [ ] **Step 4: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "test: close coverage gaps for user profiles feature"
```
