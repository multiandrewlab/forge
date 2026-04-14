import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { PromptVariableRow, PostRow, PostRevisionRow } from '../../db/queries/types.js';

vi.mock('../../db/queries/prompt-variables.js', () => ({
  findPromptVariablesByPostId: vi.fn(),
  upsertPromptVariable: vi.fn(),
  deleteStalePromptVariables: vi.fn(),
}));

vi.mock('../../db/queries/revisions.js', () => ({
  findRevisionsByPostId: vi.fn(),
}));

vi.mock('../../db/queries/posts.js', () => ({
  findPostById: vi.fn(),
}));

import {
  findPromptVariablesByPostId,
  upsertPromptVariable,
  deleteStalePromptVariables,
} from '../../db/queries/prompt-variables.js';
import { findRevisionsByPostId } from '../../db/queries/revisions.js';
import { findPostById } from '../../db/queries/posts.js';
import {
  getVariablesForPost,
  syncVariablesFromContent,
  assemblePromptForPost,
} from '../../services/playground.js';

const mockFindVariables = findPromptVariablesByPostId as ReturnType<typeof vi.fn>;
const mockUpsert = upsertPromptVariable as ReturnType<typeof vi.fn>;
const mockDeleteStale = deleteStalePromptVariables as ReturnType<typeof vi.fn>;
const mockFindRevisions = findRevisionsByPostId as ReturnType<typeof vi.fn>;
const mockFindPost = findPostById as ReturnType<typeof vi.fn>;

const POST_ID = '550e8400-e29b-41d4-a716-446655440000';

function createVariableRow(overrides: Partial<PromptVariableRow> = {}): PromptVariableRow {
  return {
    id: 'v001',
    post_id: POST_ID,
    name: 'topic',
    placeholder: null,
    sort_order: 0,
    default_value: null,
    ...overrides,
  };
}

function createPostRow(overrides: Partial<PostRow> = {}): PostRow {
  return {
    id: POST_ID,
    author_id: 'a001',
    title: 'Test Post',
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
    ...overrides,
  };
}

function createRevisionRow(overrides: Partial<PostRevisionRow> = {}): PostRevisionRow {
  return {
    id: 'r001',
    post_id: POST_ID,
    author_id: 'a001',
    content: 'Write about {{topic}} in {{language}}',
    message: null,
    revision_number: 1,
    created_at: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('playground service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getVariablesForPost', () => {
    it('delegates to findPromptVariablesByPostId and returns the result', async () => {
      const rows = [
        createVariableRow(),
        createVariableRow({ id: 'v002', name: 'language', sort_order: 1 }),
      ];
      mockFindVariables.mockResolvedValue(rows);

      const result = await getVariablesForPost(POST_ID);

      expect(mockFindVariables).toHaveBeenCalledWith(POST_ID);
      expect(result).toEqual(rows);
    });
  });

  describe('syncVariablesFromContent', () => {
    it('extracts variables, upserts each, deletes stale, and returns fresh list', async () => {
      const content = 'Hello {{name}}, welcome to {{place}}';
      const freshRows = [
        createVariableRow({ name: 'name', sort_order: 0 }),
        createVariableRow({ id: 'v002', name: 'place', sort_order: 1 }),
      ];
      mockUpsert.mockResolvedValue(createVariableRow());
      mockDeleteStale.mockResolvedValue(undefined);
      mockFindVariables.mockResolvedValue(freshRows);

      const result = await syncVariablesFromContent(POST_ID, content);

      expect(mockUpsert).toHaveBeenCalledTimes(2);
      expect(mockUpsert).toHaveBeenCalledWith({ postId: POST_ID, name: 'name', sortOrder: 0 });
      expect(mockUpsert).toHaveBeenCalledWith({ postId: POST_ID, name: 'place', sortOrder: 1 });
      expect(mockDeleteStale).toHaveBeenCalledWith(POST_ID, ['name', 'place']);
      expect(mockFindVariables).toHaveBeenCalledWith(POST_ID);
      expect(result).toEqual(freshRows);
    });

    it('handles content with no variables (calls deleteStale with empty array)', async () => {
      const content = 'No variables here';
      mockDeleteStale.mockResolvedValue(undefined);
      mockFindVariables.mockResolvedValue([]);

      const result = await syncVariablesFromContent(POST_ID, content);

      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockDeleteStale).toHaveBeenCalledWith(POST_ID, []);
      expect(mockFindVariables).toHaveBeenCalledWith(POST_ID);
      expect(result).toEqual([]);
    });
  });

  describe('assemblePromptForPost', () => {
    it('fetches post and latest revision, replaces variables, returns assembled string', async () => {
      mockFindPost.mockResolvedValue(createPostRow());
      mockFindRevisions.mockResolvedValue([
        createRevisionRow({ content: 'Write about {{topic}} in {{language}}' }),
      ]);

      const result = await assemblePromptForPost(POST_ID, {
        topic: 'testing',
        language: 'TypeScript',
      });

      expect(mockFindPost).toHaveBeenCalledWith(POST_ID);
      expect(mockFindRevisions).toHaveBeenCalledWith(POST_ID);
      expect(result).toBe('Write about testing in TypeScript');
    });

    it('throws "Post not found" when post does not exist', async () => {
      mockFindPost.mockResolvedValue(null);

      await expect(assemblePromptForPost(POST_ID, {})).rejects.toThrow('Post not found');
    });

    it('throws "Post has no content" when no revisions exist', async () => {
      mockFindPost.mockResolvedValue(createPostRow());
      mockFindRevisions.mockResolvedValue([]);

      await expect(assemblePromptForPost(POST_ID, {})).rejects.toThrow('Post has no content');
    });

    it('leaves unmatched variables as {{name}} in output', async () => {
      mockFindPost.mockResolvedValue(createPostRow());
      mockFindRevisions.mockResolvedValue([
        createRevisionRow({ content: 'Hello {{name}}, your role is {{role}}' }),
      ]);

      const result = await assemblePromptForPost(POST_ID, { name: 'Alice' });

      expect(result).toBe('Hello Alice, your role is {{role}}');
    });
  });
});
