import { describe, it, expect } from 'vitest';
import { toSearchSnippet, toUserSummary, buildAiActions } from '../../services/search.js';
import type { SearchPostRow, SearchUserRow } from '../../db/queries/search.js';

const basePostRow: SearchPostRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  title: 'React Hooks Guide',
  content_type: 'snippet',
  language: 'typescript',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  author_display_name: 'Alice',
  author_avatar_url: 'https://example.com/avatar.png',
  excerpt: 'Learn about React hooks...',
  rank: 0.85,
};

const baseUserRow: SearchUserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  display_name: 'Alice',
  avatar_url: 'https://example.com/avatar.png',
  post_count: 42,
};

describe('toSearchSnippet', () => {
  it('maps snake_case post row to camelCase SearchSnippet with tsvector matchedBy', () => {
    const result = toSearchSnippet(basePostRow);

    expect(result).toEqual({
      id: '660e8400-e29b-41d4-a716-446655440000',
      title: 'React Hooks Guide',
      contentType: 'snippet',
      language: 'typescript',
      excerpt: 'Learn about React hooks...',
      authorId: '550e8400-e29b-41d4-a716-446655440000',
      authorDisplayName: 'Alice',
      authorAvatarUrl: 'https://example.com/avatar.png',
      rank: 0.85,
      matchedBy: 'tsvector',
    });
  });

  it('handles null language', () => {
    const row: SearchPostRow = { ...basePostRow, language: null };
    const result = toSearchSnippet(row);
    expect(result.language).toBeNull();
  });

  it('handles null author_avatar_url', () => {
    const row: SearchPostRow = { ...basePostRow, author_avatar_url: null };
    const result = toSearchSnippet(row);
    expect(result.authorAvatarUrl).toBeNull();
  });

  it('handles null excerpt by defaulting to empty string', () => {
    const row: SearchPostRow = { ...basePostRow, excerpt: null };
    const result = toSearchSnippet(row);
    expect(result.excerpt).toBe('');
  });

  it('accepts trigram matchedBy parameter', () => {
    const result = toSearchSnippet(basePostRow, 'trigram');
    expect(result.matchedBy).toBe('trigram');
  });
});

describe('toUserSummary', () => {
  it('maps snake_case user row to camelCase UserSummary', () => {
    const result = toUserSummary(baseUserRow);

    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      displayName: 'Alice',
      avatarUrl: 'https://example.com/avatar.png',
      postCount: 42,
    });
  });

  it('handles null avatar_url', () => {
    const row: SearchUserRow = { ...baseUserRow, avatar_url: null };
    const result = toUserSummary(row);
    expect(result.avatarUrl).toBeNull();
  });
});

describe('buildAiActions', () => {
  it('returns empty array when q is empty string', () => {
    expect(buildAiActions('')).toEqual([]);
  });

  it('returns empty array when q has 1 character', () => {
    expect(buildAiActions('a')).toEqual([]);
  });

  it('returns 2 stub actions when q has 2+ characters', () => {
    const actions = buildAiActions('react');

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      label: 'Generate a react tutorial',
      action: 'generate',
      params: { topic: 'react' },
    });
    expect(actions[1]).toEqual({
      label: 'Explain react',
      action: 'explain',
      params: { topic: 'react' },
    });
  });

  it('returns 2 stub actions for exactly 2 characters', () => {
    const actions = buildAiActions('go');

    expect(actions).toHaveLength(2);
    expect(actions[0]).toEqual({
      label: 'Generate a go tutorial',
      action: 'generate',
      params: { topic: 'go' },
    });
    expect(actions[1]).toEqual({
      label: 'Explain go',
      action: 'explain',
      params: { topic: 'go' },
    });
  });
});
