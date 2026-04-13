import { describe, it, expect } from 'vitest';
import {
  searchQuerySchema,
  type SearchSnippet,
  type AiAction,
  type UserSummary,
  type SearchResponse,
  type SearchQuery,
} from '../../types/search.js';

describe('searchQuerySchema', () => {
  it('accepts a canonical payload with all fields', () => {
    const input = {
      q: 'react hooks',
      type: 'snippet',
      tag: 'javascript',
      fuzzy: true,
      limit: 10,
    };
    const result = searchQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.q).toBe('react hooks');
      expect(result.data.type).toBe('snippet');
      expect(result.data.tag).toBe('javascript');
      expect(result.data.fuzzy).toBe(true);
      expect(result.data.limit).toBe(10);
    }
  });

  it('applies default limit of 20 when limit is omitted', () => {
    const input = { q: 'test' };
    const result = searchQuerySchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(20);
    }
  });

  it('accepts all valid content types', () => {
    for (const type of ['snippet', 'prompt', 'document', 'link'] as const) {
      const result = searchQuerySchema.safeParse({ q: 'test', type });
      expect(result.success).toBe(true);
    }
  });

  it('rejects type: "bogus"', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', type: 'bogus' });
    expect(result.success).toBe(false);
  });

  it('rejects limit: 0', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', limit: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects limit: 51', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', limit: 51 });
    expect(result.success).toBe(false);
  });

  it('rejects q exceeding 200 characters', () => {
    const longQ = 'a'.repeat(201);
    const result = searchQuerySchema.safeParse({ q: longQ });
    expect(result.success).toBe(false);
  });

  it('accepts q at exactly 200 characters', () => {
    const exactQ = 'a'.repeat(200);
    const result = searchQuerySchema.safeParse({ q: exactQ });
    expect(result.success).toBe(true);
  });

  it('rejects tag exceeding 50 characters', () => {
    const longTag = 'a'.repeat(51);
    const result = searchQuerySchema.safeParse({ q: 'test', tag: longTag });
    expect(result.success).toBe(false);
  });

  it('accepts tag at exactly 50 characters', () => {
    const exactTag = 'a'.repeat(50);
    const result = searchQuerySchema.safeParse({ q: 'test', tag: exactTag });
    expect(result.success).toBe(true);
  });

  it('coerces fuzzy from string "true" to boolean true', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', fuzzy: 'true' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fuzzy).toBe(true);
    }
  });

  it('coerces fuzzy from string "false" to boolean false', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', fuzzy: 'false' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fuzzy).toBe(false);
    }
  });

  it('coerces limit from string to number', () => {
    const result = searchQuerySchema.safeParse({ q: 'test', limit: '25' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
    }
  });

  it('allows optional fields to be omitted', () => {
    const result = searchQuerySchema.safeParse({ q: 'minimal' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBeUndefined();
      expect(result.data.tag).toBeUndefined();
      expect(result.data.fuzzy).toBeUndefined();
      expect(result.data.limit).toBe(20);
    }
  });
});

describe('SearchSnippet interface', () => {
  it('can construct a valid SearchSnippet object', () => {
    const snippet: SearchSnippet = {
      id: 'p1',
      title: 'React Hooks Guide',
      contentType: 'snippet',
      language: 'typescript',
      excerpt: 'A comprehensive guide to React hooks...',
      authorId: 'u1',
      authorDisplayName: 'Jane Doe',
      authorAvatarUrl: 'https://example.com/avatar.jpg',
      rank: 0.95,
      matchedBy: 'tsvector',
    };
    expect(snippet.id).toBe('p1');
    expect(snippet.contentType).toBe('snippet');
    expect(snippet.matchedBy).toBe('tsvector');
  });

  it('allows null language and avatarUrl', () => {
    const snippet: SearchSnippet = {
      id: 'p2',
      title: 'Untitled',
      contentType: 'document',
      language: null,
      excerpt: '',
      authorId: 'u2',
      authorDisplayName: 'Anonymous',
      authorAvatarUrl: null,
      rank: 0.5,
      matchedBy: 'trigram',
    };
    expect(snippet.language).toBeNull();
    expect(snippet.authorAvatarUrl).toBeNull();
  });
});

describe('AiAction interface', () => {
  it('can construct a valid AiAction object', () => {
    const action: AiAction = {
      label: 'Summarize',
      action: 'summarize',
      params: { postId: 'p1' },
    };
    expect(action.label).toBe('Summarize');
    expect(action.action).toBe('summarize');
    expect(action.params).toEqual({ postId: 'p1' });
  });
});

describe('UserSummary interface', () => {
  it('can construct a valid UserSummary object', () => {
    const user: UserSummary = {
      id: 'u1',
      displayName: 'Jane Doe',
      avatarUrl: 'https://example.com/avatar.jpg',
      postCount: 42,
    };
    expect(user.id).toBe('u1');
    expect(user.postCount).toBe(42);
  });

  it('allows null avatarUrl', () => {
    const user: UserSummary = {
      id: 'u2',
      displayName: 'Anonymous',
      avatarUrl: null,
      postCount: 0,
    };
    expect(user.avatarUrl).toBeNull();
  });
});

describe('SearchResponse interface', () => {
  it('can construct a valid SearchResponse object', () => {
    const response: SearchResponse = {
      snippets: [
        {
          id: 'p1',
          title: 'React Hooks',
          contentType: 'snippet',
          language: 'typescript',
          excerpt: 'Hooks guide...',
          authorId: 'u1',
          authorDisplayName: 'Jane',
          authorAvatarUrl: null,
          rank: 0.9,
          matchedBy: 'tsvector',
        },
      ],
      aiActions: [{ label: 'Summarize', action: 'summarize', params: { postId: 'p1' } }],
      people: [{ id: 'u1', displayName: 'Jane', avatarUrl: null, postCount: 5 }],
      query: 'react',
      totalResults: 3,
    };
    expect(response.snippets).toHaveLength(1);
    expect(response.aiActions).toHaveLength(1);
    expect(response.people).toHaveLength(1);
    expect(response.query).toBe('react');
    expect(response.totalResults).toBe(3);
  });

  it('allows empty arrays', () => {
    const response: SearchResponse = {
      snippets: [],
      aiActions: [],
      people: [],
      query: '',
      totalResults: 0,
    };
    expect(response.snippets).toHaveLength(0);
    expect(response.totalResults).toBe(0);
  });
});

describe('SearchQuery type', () => {
  it('is compatible with searchQuerySchema output', () => {
    const result = searchQuerySchema.safeParse({
      q: 'test',
      type: 'prompt',
      limit: 5,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      const query: SearchQuery = result.data;
      expect(query.q).toBe('test');
      expect(query.type).toBe('prompt');
      expect(query.limit).toBe(5);
    }
  });
});
