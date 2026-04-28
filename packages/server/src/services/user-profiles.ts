import type { UserProfileResponse, UserProfileBadge, UserProfilePost } from '@forge/shared';
import type { UserPublicPostRow } from '../db/queries/user-profiles.js';
import {
  getUserPostCount,
  getUserTotalVotes,
  getUserTopTags,
  getTopContributors,
  getTagExperts,
  getUserPublicPosts,
} from '../db/queries/user-profiles.js';
import { findUserById } from '../db/queries/users.js';

/**
 * Transform a UserPublicPostRow (snake_case DB row) into a UserProfilePost DTO.
 * Splits comma-separated tags string into an array; null tags become [].
 */
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

/**
 * Assemble a full UserProfileResponse by calling all query functions in parallel.
 * Returns null when the user is not found.
 */
export async function buildUserProfile(
  userId: string,
  limit: number,
  cursor?: Date,
): Promise<UserProfileResponse | null> {
  const [user, postCount, totalVotes, topTags, topContributors, tagExperts, posts] =
    await Promise.all([
      findUserById(userId),
      getUserPostCount(userId),
      getUserTotalVotes(userId),
      getUserTopTags(userId),
      getTopContributors(),
      getTagExperts(userId),
      getUserPublicPosts(userId, limit, cursor),
    ]);

  if (!user) {
    return null;
  }

  // ── Badges ──────────────────────────────────────────────────────

  const badges: UserProfileBadge[] = [];

  // Top contributor badge: rank is 1-indexed position in the result list
  const contributorIndex = topContributors.findIndex((c) => c.author_id === userId);
  if (contributorIndex !== -1) {
    badges.push({
      type: 'top_contributor',
      label: 'Top Contributor',
      rank: contributorIndex + 1,
    });
  }

  // Tag expert badges
  for (const expert of tagExperts) {
    badges.push({
      type: 'tag_expert',
      label: `Expert in ${expert.tag_name}`,
    });
  }

  // ── Cursor ──────────────────────────────────────────────────────

  let nextCursor: string | null = null;
  if (posts.length >= limit) {
    const lastPost = posts[posts.length - 1] as UserPublicPostRow;
    nextCursor = `${lastPost.created_at.toISOString()}|${lastPost.id}`;
  }

  return {
    user: {
      id: user.id,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      createdAt: user.created_at.toISOString(),
    },
    stats: {
      postCount,
      totalVotes,
      topTags: topTags.map((t) => ({
        tagName: t.tag_name,
        voteSum: t.vote_sum,
      })),
    },
    badges,
    posts: posts.map(toUserProfilePost),
    cursor: nextCursor,
  };
}
