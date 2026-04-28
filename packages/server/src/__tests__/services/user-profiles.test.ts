import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserProfileResponse } from '@forge/shared';
import type { UserRow } from '../../db/queries/types.js';
import type {
  TopTagRow,
  TopContributorRow,
  TagExpertRow,
  UserPublicPostRow,
} from '../../db/queries/user-profiles.js';

// ── Mock query modules BEFORE importing the service under test ──────

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

import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../../db/queries/user-profiles.js';
import { findUserById } from '../../db/queries/users.js';
import { toUserProfilePost, buildUserProfile } from '../../services/user-profiles.js';

// ── Typed mock references ───────────────────────────────────────────

const mockGetUserPostCount = getUserPostCount as ReturnType<typeof vi.fn>;
const mockGetUserTotalVotes = getUserTotalVotes as ReturnType<typeof vi.fn>;
const mockGetUserTopTags = getUserTopTags as ReturnType<typeof vi.fn>;
const mockGetTopContributors = getTopContributors as ReturnType<typeof vi.fn>;
const mockGetTagExperts = getTagExperts as ReturnType<typeof vi.fn>;
const mockGetUserPublicPosts = getUserPublicPosts as ReturnType<typeof vi.fn>;
const mockFindUserById = findUserById as ReturnType<typeof vi.fn>;

// ── Test data factories ─────────────────────────────────────────────

const USER_ID = 'a0000000-0000-0000-0000-000000000099';

function createUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: USER_ID,
    email: 'testuser@example.com',
    display_name: 'Test User',
    avatar_url: 'https://example.com/avatar.png',
    auth_provider: 'local',
    password_hash: '$2b$12$hash',
    created_at: new Date('2025-01-15T00:00:00.000Z'),
    updated_at: new Date('2025-06-01T00:00:00.000Z'),
    ...overrides,
  };
}

function createPostRow(overrides: Partial<UserPublicPostRow> = {}): UserPublicPostRow {
  return {
    id: 'p001',
    title: 'Test Post',
    content_type: 'snippet',
    language: 'typescript',
    vote_count: 10,
    created_at: new Date('2025-03-01T12:00:00.000Z'),
    tags: 'typescript,react',
    ...overrides,
  };
}

function createTopTagRow(overrides: Partial<TopTagRow> = {}): TopTagRow {
  return {
    tag_id: 'tag-1',
    tag_name: 'typescript',
    vote_sum: 42,
    ...overrides,
  };
}

function createTopContributorRow(overrides: Partial<TopContributorRow> = {}): TopContributorRow {
  return {
    author_id: USER_ID,
    display_name: 'Test User',
    avatar_url: 'https://example.com/avatar.png',
    post_count: 10,
    vote_sum: 100,
    ...overrides,
  };
}

function createTagExpertRow(overrides: Partial<TagExpertRow> = {}): TagExpertRow {
  return {
    tag_id: 'tag-1',
    tag_name: 'typescript',
    post_count: 5,
    vote_sum: 30,
    ...overrides,
  };
}

/**
 * Helper: assert result is non-null and return typed value.
 * Avoids forbidden non-null assertion (`!`) while keeping tests readable.
 */
function assertProfile(result: UserProfileResponse | null): UserProfileResponse {
  expect(result).not.toBeNull();
  return result as UserProfileResponse;
}

// ── Tests ───────────────────────────────────────────────────────────

describe('user-profiles service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── toUserProfilePost ─────────────────────────────────────────────

  describe('toUserProfilePost', () => {
    it('transforms snake_case row to camelCase UserProfilePost', () => {
      const row = createPostRow();
      const result = toUserProfilePost(row);

      expect(result).toEqual({
        id: 'p001',
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        voteCount: 10,
        createdAt: '2025-03-01T12:00:00.000Z',
        tags: ['typescript', 'react'],
      });
    });

    it('splits comma-separated tags string into array', () => {
      const row = createPostRow({ tags: 'go,rust,python' });
      const result = toUserProfilePost(row);

      expect(result.tags).toEqual(['go', 'rust', 'python']);
    });

    it('returns empty array when tags is null', () => {
      const row = createPostRow({ tags: null });
      const result = toUserProfilePost(row);

      expect(result.tags).toEqual([]);
    });

    it('handles single tag', () => {
      const row = createPostRow({ tags: 'typescript' });
      const result = toUserProfilePost(row);

      expect(result.tags).toEqual(['typescript']);
    });

    it('handles null language', () => {
      const row = createPostRow({ language: null });
      const result = toUserProfilePost(row);

      expect(result.language).toBeNull();
    });

    it('converts created_at Date to ISO string', () => {
      const row = createPostRow({ created_at: new Date('2026-06-15T08:30:00.000Z') });
      const result = toUserProfilePost(row);

      expect(result.createdAt).toBe('2026-06-15T08:30:00.000Z');
    });
  });

  // ── buildUserProfile ──────────────────────────────────────────────

  describe('buildUserProfile', () => {
    const LIMIT = 10;

    function setupDefaultMocks(userOverrides: Partial<UserRow> = {}): void {
      mockFindUserById.mockResolvedValue(createUserRow(userOverrides));
      mockGetUserPostCount.mockResolvedValue(5);
      mockGetUserTotalVotes.mockResolvedValue(42);
      mockGetUserTopTags.mockResolvedValue([
        createTopTagRow({ tag_name: 'typescript', vote_sum: 30 }),
        createTopTagRow({ tag_id: 'tag-2', tag_name: 'react', vote_sum: 12 }),
      ]);
      mockGetTopContributors.mockResolvedValue([]);
      mockGetTagExperts.mockResolvedValue([]);
      mockGetUserPublicPosts.mockResolvedValue([
        createPostRow({ id: 'p001', created_at: new Date('2025-03-01T12:00:00.000Z') }),
        createPostRow({ id: 'p002', created_at: new Date('2025-02-15T08:00:00.000Z') }),
      ]);
    }

    it('returns null when user is not found', async () => {
      mockFindUserById.mockResolvedValue(null);

      const result = await buildUserProfile(USER_ID, LIMIT);

      expect(result).toBeNull();
      expect(mockFindUserById).toHaveBeenCalledWith(USER_ID);
    });

    it('calls all 7 query functions in parallel', async () => {
      setupDefaultMocks();

      await buildUserProfile(USER_ID, LIMIT);

      expect(mockFindUserById).toHaveBeenCalledWith(USER_ID);
      expect(mockGetUserPostCount).toHaveBeenCalledWith(USER_ID);
      expect(mockGetUserTotalVotes).toHaveBeenCalledWith(USER_ID);
      expect(mockGetUserTopTags).toHaveBeenCalledWith(USER_ID);
      expect(mockGetTopContributors).toHaveBeenCalledWith();
      expect(mockGetTagExperts).toHaveBeenCalledWith(USER_ID);
      expect(mockGetUserPublicPosts).toHaveBeenCalledWith(USER_ID, LIMIT, undefined);
    });

    it('passes cursor to getUserPublicPosts when provided', async () => {
      setupDefaultMocks();
      const cursor = new Date('2025-01-01T00:00:00.000Z');

      await buildUserProfile(USER_ID, LIMIT, cursor);

      expect(mockGetUserPublicPosts).toHaveBeenCalledWith(USER_ID, LIMIT, cursor);
    });

    it('assembles user object with correct camelCase fields', async () => {
      setupDefaultMocks({
        display_name: 'Alice',
        avatar_url: 'https://example.com/alice.png',
        created_at: new Date('2025-01-15T00:00:00.000Z'),
      });

      const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

      expect(profile.user).toEqual({
        id: USER_ID,
        displayName: 'Alice',
        avatarUrl: 'https://example.com/alice.png',
        createdAt: '2025-01-15T00:00:00.000Z',
      });
    });

    it('maps stats correctly with topTags tagName/voteSum from tag_name/vote_sum', async () => {
      setupDefaultMocks();

      const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

      expect(profile.stats).toEqual({
        postCount: 5,
        totalVotes: 42,
        topTags: [
          { tagName: 'typescript', voteSum: 30 },
          { tagName: 'react', voteSum: 12 },
        ],
      });
    });

    it('maps posts using toUserProfilePost transform', async () => {
      setupDefaultMocks();

      const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

      expect(profile.posts).toHaveLength(2);
      expect(profile.posts[0]).toEqual({
        id: 'p001',
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        voteCount: 10,
        createdAt: '2025-03-01T12:00:00.000Z',
        tags: ['typescript', 'react'],
      });
    });

    // ── Badge tests ───────────────────────────────────────────────

    describe('badges', () => {
      it('returns empty badges when user is not a top contributor and has no tag expert badges', async () => {
        setupDefaultMocks();

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

        expect(profile.badges).toEqual([]);
      });

      it('assigns top_contributor badge with rank 1 when user is first in getTopContributors', async () => {
        setupDefaultMocks();
        mockGetTopContributors.mockResolvedValue([
          createTopContributorRow({ author_id: USER_ID }),
          createTopContributorRow({ author_id: 'other-user-1' }),
          createTopContributorRow({ author_id: 'other-user-2' }),
        ]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));
        const contributorBadge = profile.badges.find((b) => b.type === 'top_contributor');

        expect(contributorBadge).toEqual({
          type: 'top_contributor',
          label: 'Top Contributor',
          rank: 1,
        });
      });

      it('assigns top_contributor badge with rank 2 when user is second', async () => {
        setupDefaultMocks();
        mockGetTopContributors.mockResolvedValue([
          createTopContributorRow({ author_id: 'other-user-1' }),
          createTopContributorRow({ author_id: USER_ID }),
          createTopContributorRow({ author_id: 'other-user-2' }),
        ]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));
        const contributorBadge = profile.badges.find((b) => b.type === 'top_contributor');

        expect(contributorBadge).toEqual({
          type: 'top_contributor',
          label: 'Top Contributor',
          rank: 2,
        });
      });

      it('assigns top_contributor badge with rank 3 when user is third', async () => {
        setupDefaultMocks();
        mockGetTopContributors.mockResolvedValue([
          createTopContributorRow({ author_id: 'other-user-1' }),
          createTopContributorRow({ author_id: 'other-user-2' }),
          createTopContributorRow({ author_id: USER_ID }),
        ]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));
        const contributorBadge = profile.badges.find((b) => b.type === 'top_contributor');

        expect(contributorBadge).toEqual({
          type: 'top_contributor',
          label: 'Top Contributor',
          rank: 3,
        });
      });

      it('does not assign top_contributor badge when user is not in top contributors', async () => {
        setupDefaultMocks();
        mockGetTopContributors.mockResolvedValue([
          createTopContributorRow({ author_id: 'other-user-1' }),
          createTopContributorRow({ author_id: 'other-user-2' }),
          createTopContributorRow({ author_id: 'other-user-3' }),
        ]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));
        const contributorBadge = profile.badges.find((b) => b.type === 'top_contributor');

        expect(contributorBadge).toBeUndefined();
      });

      it('creates tag_expert badges from getTagExperts result with "Expert in {tag_name}" label', async () => {
        setupDefaultMocks();
        mockGetTagExperts.mockResolvedValue([
          createTagExpertRow({ tag_name: 'typescript' }),
          createTagExpertRow({ tag_id: 'tag-2', tag_name: 'react' }),
        ]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));
        const expertBadges = profile.badges.filter((b) => b.type === 'tag_expert');

        expect(expertBadges).toEqual([
          { type: 'tag_expert', label: 'Expert in typescript' },
          { type: 'tag_expert', label: 'Expert in react' },
        ]);
      });

      it('combines top_contributor and tag_expert badges', async () => {
        setupDefaultMocks();
        mockGetTopContributors.mockResolvedValue([createTopContributorRow({ author_id: USER_ID })]);
        mockGetTagExperts.mockResolvedValue([createTagExpertRow({ tag_name: 'typescript' })]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

        expect(profile.badges).toHaveLength(2);
        expect(profile.badges[0]).toEqual({
          type: 'top_contributor',
          label: 'Top Contributor',
          rank: 1,
        });
        expect(profile.badges[1]).toEqual({
          type: 'tag_expert',
          label: 'Expert in typescript',
        });
      });
    });

    // ── Cursor tests ──────────────────────────────────────────────

    describe('cursor', () => {
      it('computes cursor from last post created_at + id when posts.length >= limit', async () => {
        setupDefaultMocks();
        const posts = [
          createPostRow({
            id: 'p001',
            created_at: new Date('2025-03-01T12:00:00.000Z'),
          }),
          createPostRow({
            id: 'p002',
            created_at: new Date('2025-02-15T08:00:00.000Z'),
          }),
        ];
        mockGetUserPublicPosts.mockResolvedValue(posts);

        // limit = 2, posts.length = 2, so cursor should be set
        const profile = assertProfile(await buildUserProfile(USER_ID, 2));

        expect(profile.cursor).toBe('2025-02-15T08:00:00.000Z|p002');
      });

      it('returns null cursor when posts.length < limit', async () => {
        setupDefaultMocks();
        const posts = [createPostRow({ id: 'p001' })];
        mockGetUserPublicPosts.mockResolvedValue(posts);

        // limit = 10, posts.length = 1, so no cursor
        const profile = assertProfile(await buildUserProfile(USER_ID, 10));

        expect(profile.cursor).toBeNull();
      });

      it('returns null cursor when posts array is empty', async () => {
        setupDefaultMocks();
        mockGetUserPublicPosts.mockResolvedValue([]);

        const profile = assertProfile(await buildUserProfile(USER_ID, 10));

        expect(profile.cursor).toBeNull();
      });
    });

    // ── Edge cases ────────────────────────────────────────────────

    describe('edge cases', () => {
      it('handles user with null avatar_url', async () => {
        setupDefaultMocks({ avatar_url: null });

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

        expect(profile.user.avatarUrl).toBeNull();
      });

      it('handles empty topTags array', async () => {
        setupDefaultMocks();
        mockGetUserTopTags.mockResolvedValue([]);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

        expect(profile.stats.topTags).toEqual([]);
      });

      it('handles zero postCount and totalVotes', async () => {
        setupDefaultMocks();
        mockGetUserPostCount.mockResolvedValue(0);
        mockGetUserTotalVotes.mockResolvedValue(0);

        const profile = assertProfile(await buildUserProfile(USER_ID, LIMIT));

        expect(profile.stats.postCount).toBe(0);
        expect(profile.stats.totalVotes).toBe(0);
      });
    });
  });
});
