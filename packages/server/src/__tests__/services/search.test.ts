import { describe, it, expect } from 'vitest';
import { toSearchSnippet, toUserSummary, buildAiActions } from '../../services/search.js';
import type { SearchPostRow, SearchUserRow } from '../../db/queries/search.js';
import type { AiSearchFilters } from '@forge/shared';

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

  describe('buildAiActions with filters', () => {
    it('returns empty array when q is too short even with filters', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: null,
        contentType: null,
        textQuery: 'a',
      };
      expect(buildAiActions('a', filters)).toEqual([]);
    });

    it('generates language-specific action when filters.language is set', () => {
      const filters: AiSearchFilters = {
        tags: ['typescript'],
        language: 'typescript',
        contentType: 'snippet',
        textQuery: 'binary search',
      };
      const actions = buildAiActions('typescript binary search', filters);
      expect(
        actions.some((a) => a.label === 'Generate a typescript binary search implementation'),
      ).toBe(true);
      const langAction = actions.find(
        (a) => a.label === 'Generate a typescript binary search implementation',
      );
      expect(langAction).toEqual({
        label: 'Generate a typescript binary search implementation',
        action: 'generate',
        params: { description: 'binary search', contentType: 'snippet', language: 'typescript' },
      });
    });

    it('generates prompt-specific action when filters.contentType is prompt', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: null,
        contentType: 'prompt',
        textQuery: 'summarize text',
      };
      const actions = buildAiActions('summarize', filters);
      expect(actions.some((a) => a.label === 'Generate a prompt for summarize text')).toBe(true);
      const promptAction = actions.find((a) => a.label === 'Generate a prompt for summarize text');
      expect(promptAction).toEqual({
        label: 'Generate a prompt for summarize text',
        action: 'generate',
        params: { description: 'summarize text', contentType: 'prompt' },
      });
    });

    it('always includes a generic document action when filters are provided', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: null,
        contentType: null,
        textQuery: 'react hooks',
      };
      const actions = buildAiActions('react hooks', filters);
      expect(actions.some((a) => a.label === 'Generate content about react hooks')).toBe(true);
      const docAction = actions.find((a) => a.label === 'Generate content about react hooks');
      expect(docAction).toEqual({
        label: 'Generate content about react hooks',
        action: 'generate',
        params: { description: 'react hooks', contentType: 'document' },
      });
    });

    it('includes both language and document actions when language is set (no prompt contentType)', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: 'python',
        contentType: 'snippet',
        textQuery: 'quicksort',
      };
      const actions = buildAiActions('python quicksort', filters);
      expect(actions).toHaveLength(2);
      expect(actions[0].params['language']).toBe('python');
      expect(actions[1].params['contentType']).toBe('document');
    });

    it('includes both prompt and document actions when contentType is prompt (no language)', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: null,
        contentType: 'prompt',
        textQuery: 'write a story',
      };
      const actions = buildAiActions('write a story', filters);
      expect(actions).toHaveLength(2);
      expect(actions[0].params['contentType']).toBe('prompt');
      expect(actions[1].params['contentType']).toBe('document');
    });

    it('only document action when no language and non-prompt contentType', () => {
      const filters: AiSearchFilters = {
        tags: [],
        language: null,
        contentType: 'document',
        textQuery: 'architecture patterns',
      };
      const actions = buildAiActions('architecture patterns', filters);
      expect(actions).toHaveLength(1);
      expect(actions[0].params['contentType']).toBe('document');
    });
  });
});
