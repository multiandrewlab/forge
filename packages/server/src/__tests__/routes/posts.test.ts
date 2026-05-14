import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';

const mockClientQuery = vi.fn();
const mockClient = { query: mockClientQuery };

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(
    async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) => fn(mockClient),
  ),
}));

// Disable rate limiting in route tests
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {
    // no-op
  },
}));

// Mock findFeedPostById so we can control broadcast data in route tests
vi.mock('../../db/queries/feed.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../db/queries/feed.js')>();
  return {
    ...original,
    findFeedPostById: vi.fn(),
  };
});

// Mock fetchLinkPreview for link post creation tests
vi.mock('../../services/link-preview.js', () => ({
  fetchLinkPreview: vi.fn(),
}));

// Allow spy on @forge/shared schema methods to exercise unreachable ?? branches
vi.mock('@forge/shared', async (importOriginal) => {
  const original = await importOriginal<typeof import('@forge/shared')>();
  return {
    ...original,
    createPostSchema: {
      ...original.createPostSchema,
      safeParse: vi.fn((...args: Parameters<typeof original.createPostSchema.safeParse>) =>
        original.createPostSchema.safeParse(...args),
      ),
    },
  };
});

import { query, withTransaction } from '../../db/connection.js';
const mockWithTransaction = withTransaction as Mock;
import { buildApp } from '../../app.js';
import { createPostSchema } from '@forge/shared';
import { findFeedPostById } from '../../db/queries/feed.js';
import { fetchLinkPreview } from '../../services/link-preview.js';
import type { PostWithAuthorRow } from '../../db/queries/feed.js';
import type { FastifyInstance } from 'fastify';
import type {
  PostRow,
  PostRevisionRow,
  PostRevisionWithAuthorRow,
  PostWithRevisionRow,
  PostFileRow,
  TagRow,
} from '../../db/queries/types.js';

const mockCreatePostSchema = createPostSchema as { safeParse: Mock };
const mockFindFeedPostById = findFeedPostById as Mock;
const mockFetchLinkPreview = fetchLinkPreview as Mock;

const mockQuery = query as Mock;

const userId = '660e8400-e29b-41d4-a716-446655440000';
const otherUserId = '990e8400-e29b-41d4-a716-446655440000';
const postId = '550e8400-e29b-41d4-a716-446655440000';

const samplePostRow: PostRow = {
  id: postId,
  author_id: userId,
  title: 'Hello World',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: true,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

const sampleRevisionRow: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: postId,
  author_id: userId,
  content: 'console.log("hello");',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

const samplePostWithRevisionRow: PostWithRevisionRow = {
  ...samplePostRow,
  revision_id: '880e8400-e29b-41d4-a716-446655440000',
  content: 'console.log("hello");',
  revision_number: 1,
  message: 'Initial version',
  tags: null,
};

const sampleFeedRow: PostWithAuthorRow = {
  ...samplePostRow,
  author_display_name: 'Test User',
  author_avatar_url: null,
  tags: 'typescript',
  fork_count: 0,
  forked_from_title: null,
};

describe('post routes', () => {
  let app: FastifyInstance;
  let token: string;
  let otherToken: string;
  let broadcastSpy: ReturnType<typeof vi.spyOn>;

  const mockStorage = {
    upload: vi.fn(),
    copy: vi.fn(),
    getSignedUrl: vi.fn(),
    delete: vi.fn(),
    exists: vi.fn(),
  };

  beforeAll(async () => {
    app = await buildApp();
    // Decorate app with mock storage for file-aware revision tests
    if (!app.hasDecorator('storage')) {
      app.decorate('storage', mockStorage);
    }
    await app.ready();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test User' });
    otherToken = app.jwt.sign({
      id: otherUserId,
      email: 'other@example.com',
      displayName: 'Other User',
    });
    broadcastSpy = vi.spyOn(app.websocket.channels, 'broadcast');
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockClientQuery.mockReset();
    // Restore default withTransaction behavior (execute callback with mockClient)
    mockWithTransaction.mockImplementation(
      async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
        fn(mockClient),
    );
  });

  // ─── POST /api/posts ───────────────────────────────────────────────

  describe('POST /api/posts', () => {
    const validPayload = {
      title: 'Hello World',
      contentType: 'snippet',
      language: 'typescript',
      visibility: 'public',
      content: 'console.log("hello");',
    };

    it('creates a post with initial revision and returns 201', async () => {
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.title).toBe('Hello World');
      expect(body.post.authorId).toBe(userId);
      expect(body.revision.content).toBe('console.log("hello");');
      expect(body.revision.revisionNumber).toBe(1);

      // Verify post:new broadcast on feed channel
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:new', channel: 'feed' }),
        undefined,
      );
    });

    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { title: '' },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBeDefined();
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        payload: validPayload,
      });

      expect(response.statusCode).toBe(401);
    });

    it('creates post without language field (language ?? null branch)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, language: null }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'No Language Post',
          contentType: 'snippet',
          visibility: 'public',
          content: 'some content',
          // language omitted — hits language ?? null
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('uses isDraft ?? true fallback when parsed data has isDraft undefined', async () => {
      // isDraft has z.boolean().default(true) so it's always defined after normal parsing.
      // We override safeParse to return undefined for isDraft to hit the ?? true branch.
      mockCreatePostSchema.safeParse.mockImplementationOnce((body: unknown) => {
        const result = createPostSchema.safeParse(body);
        if (result.success) {
          const data = { ...result.data, isDraft: undefined as unknown as boolean };
          return { success: true as const, data };
        }
        return result;
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostRow, is_draft: true }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Draft Post',
          contentType: 'snippet',
          language: 'typescript',
          visibility: 'public',
          content: 'some content',
        },
      });

      expect(response.statusCode).toBe(201);
    });

    it('processes tags when provided — creates new tags and links them', async () => {
      const tagRow: TagRow = { id: 'tag-1', name: 'typescript', post_count: 0 };

      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findTagByName('typescript') — not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // createTag('typescript')
      mockQuery.mockResolvedValueOnce({ rows: [tagRow], rowCount: 1 });
      // addPostTag(postId, tagId)
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: postId, tag_id: 'tag-1' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validPayload, tags: ['typescript'] },
      });

      expect(response.statusCode).toBe(201);
      // Verify findTagByName was called (case-insensitive lookup with subscriber_count aggregate)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/LOWER\(\s*t\.name\s*\)\s*=\s*LOWER\(\$1\)/i),
        ['typescript'],
      );
      // Verify createTag was called (tag didn't exist)
      expect(mockQuery).toHaveBeenCalledWith('INSERT INTO tags (name) VALUES ($1) RETURNING *', [
        'typescript',
      ]);
      // Verify addPostTag was called
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [postId, 'tag-1'],
      );
    });

    it('processes tags when tag already exists — links without creating', async () => {
      const existingTag: TagRow = { id: 'tag-2', name: 'javascript', post_count: 5 };

      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findTagByName('javascript') — found
      mockQuery.mockResolvedValueOnce({ rows: [existingTag], rowCount: 1 });
      // addPostTag(postId, tagId)
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: postId, tag_id: 'tag-2' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validPayload, tags: ['javascript'] },
      });

      expect(response.statusCode).toBe(201);
      // Verify findTagByName was called (case-insensitive lookup with subscriber_count aggregate)
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/LOWER\(\s*t\.name\s*\)\s*=\s*LOWER\(\$1\)/i),
        ['javascript'],
      );
      // Verify createTag was NOT called (tag exists)
      expect(mockQuery).not.toHaveBeenCalledWith(
        'INSERT INTO tags (name) VALUES ($1) RETURNING *',
        ['javascript'],
      );
      // Verify addPostTag was called with existing tag's id
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [postId, 'tag-2'],
      );
    });

    it('skips post:new broadcast when findFeedPostById returns null', async () => {
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById returns null (e.g. race condition)
      mockFindFeedPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('skips tag processing when tags array is empty', async () => {
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validPayload, tags: [] },
      });

      expect(response.statusCode).toBe(201);
      // Only 2 queries: createPost + createRevision, no tag queries
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });

    it('processes multiple tags correctly', async () => {
      const tag1: TagRow = { id: 'tag-1', name: 'react', post_count: 0 };
      const tag2: TagRow = { id: 'tag-2', name: 'node', post_count: 3 };

      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findTagByName('react') — not found
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // createTag('react')
      mockQuery.mockResolvedValueOnce({ rows: [tag1], rowCount: 1 });
      // addPostTag for react
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: postId, tag_id: 'tag-1' }],
        rowCount: 1,
      });
      // findTagByName('node') — found
      mockQuery.mockResolvedValueOnce({ rows: [tag2], rowCount: 1 });
      // addPostTag for node
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: postId, tag_id: 'tag-2' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...validPayload, tags: ['react', 'node'] },
      });

      expect(response.statusCode).toBe(201);
      // 2 base + 5 tag queries = 7 total
      expect(mockQuery).toHaveBeenCalledTimes(7);
    });

    // ─── #50 prompt-variable auto-sync on creation ─────────────────
    it('auto-populates prompt_variables from {{vars}} when contentType=prompt', async () => {
      const promptPostRow: PostRow = { ...samplePostRow, content_type: 'prompt' };
      const promptRevisionRow: PostRevisionRow = {
        ...sampleRevisionRow,
        content: 'Hello {{name}}!',
      };
      const variableRow = {
        id: 'v001',
        post_id: postId,
        name: 'name',
        placeholder: null,
        sort_order: 0,
        default_value: null,
      };

      // 1. createPost
      mockQuery.mockResolvedValueOnce({ rows: [promptPostRow], rowCount: 1 });
      // 2. createRevision
      mockQuery.mockResolvedValueOnce({ rows: [promptRevisionRow], rowCount: 1 });
      // 3. syncVariablesFromContent → upsertPromptVariable('name', 0)
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // 4. syncVariablesFromContent → deleteStalePromptVariables (keepNames=['name'])
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // 5. syncVariablesFromContent → findPromptVariablesByPostId
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // 6. findFeedPostById
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'prompt' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Greeting prompt',
          contentType: 'prompt',
          visibility: 'public',
          content: 'Hello {{name}}!',
        },
      });

      expect(response.statusCode).toBe(201);

      // Verify upsertPromptVariable was called with the extracted variable
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [postId, 'name', 0],
      );
      // Verify deleteStalePromptVariables was called with the kept names
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM prompt_variables WHERE post_id = \$1 AND name != ALL/),
        [postId, ['name']],
      );
    });

    it('does NOT populate prompt_variables for snippet posts (non-prompt skip)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Snippet with brace lookalikes',
          contentType: 'snippet',
          language: 'typescript',
          visibility: 'public',
          content: 'const x = `{{not a var}}`;',
        },
      });

      expect(response.statusCode).toBe(201);
      // No prompt_variable queries should have been made
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        expect.any(Array),
      );
      expect(mockQuery).not.toHaveBeenCalledWith(
        expect.stringMatching(/DELETE FROM prompt_variables/),
        expect.any(Array),
      );
    });
  });

  // ─── GET /api/posts/:id ────────────────────────────────────────────

  describe('GET /api/posts/:id', () => {
    it('returns post with latest revision', async () => {
      // findPostWithLatestRevision query
      mockQuery.mockResolvedValueOnce({
        rows: [samplePostWithRevisionRow],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.id).toBe(postId);
      expect(body.post.title).toBe('Hello World');
      expect(body.post.revisions).toHaveLength(1);
      expect(body.post.revisions[0].content).toBe('console.log("hello");');
    });

    it('returns tags array populated from comma-joined column (#63)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostWithRevisionRow, tags: 'rust,typescript' }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().post.tags).toEqual(['rust', 'typescript']);
    });

    it('returns empty tags array when post has none (#63)', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...samplePostWithRevisionRow, tags: null }],
        rowCount: 1,
      });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().post.tags).toEqual([]);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });
  });

  // ─── PATCH /api/posts/:id ──────────────────────────────────────────

  describe('PATCH /api/posts/:id', () => {
    it('updates post metadata and returns 200', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // updatePost query
      const updatedRow = { ...samplePostRow, title: 'Updated Title' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      // findFeedPostById for broadcast
      const updatedFeedRow: PostWithAuthorRow = { ...sampleFeedRow, title: 'Updated Title' };
      mockFindFeedPostById.mockResolvedValueOnce(updatedFeedRow);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.title).toBe('Updated Title');

      // Verify post:updated broadcast on feed channel
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        undefined,
      );
    });

    it('skips post:updated broadcast when findFeedPostById returns null', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // updatePost query
      const updatedRow = { ...samplePostRow, title: 'Updated Title' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });
      // findFeedPostById returns null
      mockFindFeedPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(response.statusCode).toBe(200);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { title: 'Hacked' },
      });

      expect(response.statusCode).toBe(403);
      const body = response.json();
      expect(body.error).toBe('You can only edit your own posts');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Nope' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 400 for invalid body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        payload: { title: 'No Auth' },
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when updatePost returns null (post deleted between check and update)', async () => {
      // findPostById returns post (ownership check passes)
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // updatePost query returns no rows (race condition — post gone)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'PATCH',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { title: 'Updated Title' },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });
  });

  // ─── DELETE /api/posts/:id ─────────────────────────────────────────

  describe('DELETE /api/posts/:id', () => {
    it('soft-deletes and returns 204 without broadcasting', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // softDeletePost query
      mockQuery.mockResolvedValueOnce({ rows: [{ id: postId }], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(204);
      // Soft-delete does NOT broadcast — clients invalidate via other mechanisms
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('You can only delete your own posts');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/posts/${postId}`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/posts/:id/publish ───────────────────────────────────

  describe('POST /api/posts/:id/publish', () => {
    it('publishes a draft and returns 200', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // publishPost query
      const publishedRow = { ...samplePostRow, is_draft: false };
      mockQuery.mockResolvedValueOnce({ rows: [publishedRow], rowCount: 1 });
      // findFeedPostById for broadcast
      const publishedFeedRow: PostWithAuthorRow = { ...sampleFeedRow, is_draft: false };
      mockFindFeedPostById.mockResolvedValueOnce(publishedFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.post.isDraft).toBe(false);

      // Verify post:updated broadcast on feed channel
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        undefined,
      );
    });

    it('skips post:updated broadcast on publish when findFeedPostById returns null', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // publishPost query
      const publishedRow = { ...samplePostRow, is_draft: false };
      mockQuery.mockResolvedValueOnce({ rows: [publishedRow], rowCount: 1 });
      // findFeedPostById returns null
      mockFindFeedPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('You can only publish your own posts');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
      });

      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when publishPost returns null (post deleted between check and publish)', async () => {
      // findPostById returns post (ownership check passes)
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // publishPost query returns no rows (race condition — post gone)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/publish`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });
  });

  // ─── POST /api/posts/:id/revisions ─────────────────────────────────

  describe('POST /api/posts/:id/revisions', () => {
    it('creates a revision and returns 201', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevisionAtomic query
      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440000',
        revision_number: 2,
        content: 'console.log("updated");',
        message: 'Updated code',
      };
      mockQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      // findFeedPostById for feed broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'console.log("updated");', message: 'Updated code' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.revision.content).toBe('console.log("updated");');
      expect(body.revision.revisionNumber).toBe(2);

      // Verify revision:new broadcast on post channel
      expect(broadcastSpy).toHaveBeenCalledWith(
        `post:${postId}`,
        {
          type: 'revision:new',
          channel: `post:${postId}`,
          data: {
            id: '880e8400-e29b-41d4-a716-446655440000',
            postId,
            authorId: userId,
            authorDisplayName: null,
            authorAvatarUrl: null,
            content: 'console.log("updated");',
            message: 'Updated code',
            revisionNumber: 2,
            createdAt: new Date('2026-01-01'),
          },
        },
        undefined,
      );

      // Verify post:updated broadcast on feed channel
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        undefined,
      );
    });

    it('returns 403 when user is not the author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${otherToken}` },
        payload: { content: 'hacked' },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('You can only add revisions to your own posts');
    });

    it('returns 400 for invalid body', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: '' },
      });

      expect(response.statusCode).toBe(400);
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'something' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        payload: { content: 'no auth' },
      });

      expect(response.statusCode).toBe(401);
    });

    // ─── #50 prompt-variable auto-sync on revision ─────────────────
    it('re-syncs prompt_variables when a prompt post gets a new revision', async () => {
      const promptPost: PostRow = { ...samplePostRow, content_type: 'prompt' };
      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        revision_number: 2,
        content: 'Hello {{name}}, you live in {{city}}!',
      };
      const varRow1 = {
        id: 'v001',
        post_id: postId,
        name: 'name',
        placeholder: null,
        sort_order: 0,
        default_value: null,
      };
      const varRow2 = { ...varRow1, id: 'v002', name: 'city', sort_order: 1 };

      // findPostById ownership check (returns prompt post)
      mockQuery.mockResolvedValueOnce({ rows: [promptPost], rowCount: 1 });
      // createRevisionAtomic
      mockQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      // syncVariablesFromContent → upsert 'name'
      mockQuery.mockResolvedValueOnce({ rows: [varRow1], rowCount: 1 });
      // syncVariablesFromContent → upsert 'city'
      mockQuery.mockResolvedValueOnce({ rows: [varRow2], rowCount: 1 });
      // syncVariablesFromContent → deleteStale
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // syncVariablesFromContent → findPromptVariablesByPostId
      mockQuery.mockResolvedValueOnce({ rows: [varRow1, varRow2], rowCount: 2 });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'prompt' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'Hello {{name}}, you live in {{city}}!' },
      });

      expect(response.statusCode).toBe(201);
      // Both new variables are upserted
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [postId, 'name', 0],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [postId, 'city', 1],
      );
    });

    it('creates revision without message (message ?? null fallback branch)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      const noMsgRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        message: null,
        revision_number: 2,
      };
      mockQuery.mockResolvedValueOnce({ rows: [noMsgRevision], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: { content: 'content without message' },
        // message omitted — hits parsed.data.message ?? null (right-side fallback)
      });

      expect(response.statusCode).toBe(201);

      // Broadcast is still called for revisions without a message
      expect(broadcastSpy).toHaveBeenCalledWith(
        `post:${postId}`,
        expect.objectContaining({ type: 'revision:new' }),
        undefined,
      );
    });

    it('broadcasts revision:new with excludeWs when x-ws-client-id header is present', async () => {
      const clientId = 'ws-rev-client-1';
      const fakeSocket = { readyState: 1, send: () => {} };
      app.websocket.connections.addConnection(userId, fakeSocket, clientId);

      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440000',
        revision_number: 3,
        content: 'ws revision content',
        message: 'ws revision',
      };
      mockQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: {
          authorization: `Bearer ${token}`,
          'x-ws-client-id': clientId,
        },
        payload: { content: 'ws revision content', message: 'ws revision' },
      });

      expect(response.statusCode).toBe(201);
      expect(broadcastSpy).toHaveBeenCalledWith(
        `post:${postId}`,
        expect.objectContaining({ type: 'revision:new' }),
        fakeSocket,
      );
      // Feed broadcast also uses excludeWs
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        fakeSocket,
      );

      app.websocket.connections.removeConnection(userId, fakeSocket, clientId);
    });

    // ─── File-aware revision creation path (withTransaction) ───────
    it('creates a revision with stagedFileIds and broadcasts feed (file-aware path)', async () => {
      const stagedFileId = 'ff000000-0000-0000-0000-000000000001';
      const newRevId = '880e8400-e29b-41d4-a716-446655440000';

      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: newRevId,
        revision_number: 2,
        content: 'console.log("with files");',
        message: 'File revision',
      };

      const stagedFile: PostFileRow = {
        id: stagedFileId,
        post_id: postId,
        revision_id: null,
        filename: 'main.ts',
        content: 'console.log("hello")',
        storage_key: 'staging/abc123',
        mime_type: 'text/typescript',
        sort_order: 0,
        file_size: 42,
        created_at: new Date('2026-01-01'),
      };

      // Inside withTransaction callback — client.query calls:
      // 1. INSERT revision
      mockClientQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      // 2. SELECT staged file
      mockClientQuery.mockResolvedValueOnce({ rows: [stagedFile], rowCount: 1 });
      // 3. UPDATE staged file (set revision_id)
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      // 4. SELECT previous revision (none)
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // storage.copy for the staging key
      mockStorage.copy.mockResolvedValueOnce(undefined);
      // storage.delete for post-transaction cleanup
      mockStorage.delete.mockResolvedValueOnce(undefined);

      // findFeedPostById for feed broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'console.log("with files");',
          message: 'File revision',
          stagedFileIds: [stagedFileId],
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().revision.revisionNumber).toBe(2);

      // Verify post:updated broadcast on feed channel (covers lines 488-493)
      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        undefined,
      );
    });

    it('re-syncs prompt_variables in the file-aware path when post is prompt (#50)', async () => {
      const stagedFileId = 'ff000000-0000-0000-0000-000000000050';
      const newRevId = '880e8400-e29b-41d4-a716-446655440050';
      const promptPost: PostRow = { ...samplePostRow, content_type: 'prompt' };

      mockQuery.mockResolvedValueOnce({ rows: [promptPost], rowCount: 1 });

      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: newRevId,
        revision_number: 2,
        content: 'Hello {{audience}}!',
        message: null,
      };
      const stagedFile: PostFileRow = {
        id: stagedFileId,
        post_id: postId,
        revision_id: null,
        filename: 'prompt.md',
        content: 'Hello {{audience}}!',
        storage_key: null,
        mime_type: 'text/markdown',
        sort_order: 0,
        file_size: 21,
        created_at: new Date('2026-01-01'),
      };
      const variableRow = {
        id: 'v050',
        post_id: postId,
        name: 'audience',
        placeholder: null,
        sort_order: 0,
        default_value: null,
      };

      // Inside withTransaction:
      mockClientQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [stagedFile], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // After transaction: syncVariablesFromContent runs through `query`
      // upsert 'audience'
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // deleteStale
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // findPromptVariablesByPostId
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });

      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'prompt' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'Hello {{audience}}!',
          stagedFileIds: [stagedFileId],
        },
      });

      expect(response.statusCode).toBe(201);
      // The variable was upserted
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [postId, 'audience', 0],
      );
    });

    it('skips feed broadcast in file-aware path when findFeedPostById returns null', async () => {
      const stagedFileId = 'ff000000-0000-0000-0000-000000000002';
      const newRevId = '880e8400-e29b-41d4-a716-446655440001';

      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: newRevId,
        revision_number: 2,
        content: 'console.log("no feed");',
        message: null,
      };

      const stagedFile: PostFileRow = {
        id: stagedFileId,
        post_id: postId,
        revision_id: null,
        filename: 'index.ts',
        content: 'const x = 1;',
        storage_key: null,
        mime_type: 'text/typescript',
        sort_order: 0,
        file_size: 12,
        created_at: new Date('2026-01-01'),
      };

      // Inside withTransaction callback:
      mockClientQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [stagedFile], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // No feed row — null
      mockFindFeedPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'console.log("no feed");',
          stagedFileIds: [stagedFileId],
        },
      });

      expect(response.statusCode).toBe(201);
      // Feed broadcast should NOT have been called
      const feedCalls = broadcastSpy.mock.calls.filter((call: unknown[]) => call[0] === 'feed');
      expect(feedCalls).toHaveLength(0);
    });

    it('returns 400 when staged file is not found in transaction', async () => {
      const badFileId = 'ff000000-0000-0000-0000-000000000099';

      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const newRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440099',
        revision_number: 2,
        content: 'bad file',
        message: null,
      };

      // Inside withTransaction:
      // 1. INSERT revision
      mockClientQuery.mockResolvedValueOnce({ rows: [newRevision], rowCount: 1 });
      // 2. SELECT staged file — NOT FOUND
      mockClientQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      // Make withTransaction propagate the error thrown by the callback
      mockWithTransaction.mockImplementationOnce(
        async (fn: (client: { query: ReturnType<typeof vi.fn> }) => Promise<unknown>) =>
          fn(mockClient),
      );

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'bad file',
          stagedFileIds: [badFileId],
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('Staged file not found');
    });

    it('re-throws non-staged-file errors from transaction (lines 465-466)', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      // Make withTransaction throw a generic error (not "Staged file not found")
      mockWithTransaction.mockRejectedValueOnce(new Error('DB connection lost'));

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'will fail',
          stagedFileIds: ['ff000000-0000-0000-0000-000000000001'],
        },
      });

      // Non-staged-file errors are re-thrown and result in a 500
      expect(response.statusCode).toBe(500);
    });

    it('uses fallback message when transaction throws a non-Error value (line 461 ternary)', async () => {
      // findPostById for ownership check
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      // Throw a non-Error value — exercises the `: 'Transaction failed'` branch
      mockWithTransaction.mockRejectedValueOnce('some string error');

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          content: 'will fail',
          stagedFileIds: ['ff000000-0000-0000-0000-000000000001'],
        },
      });

      // The non-Error is re-thrown (message 'Transaction failed' doesn't start with 'Staged file not found')
      expect(response.statusCode).toBe(500);
    });
  });

  // ─── GET /api/posts/:id/revisions ──────────────────────────────────

  describe('GET /api/posts/:id/revisions', () => {
    it('lists all revisions for a post with author fields', async () => {
      // findPostById to check existence
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevisionsWithAuthorByPostId query (joined with users)
      const rev1WithAuthor: PostRevisionWithAuthorRow = {
        ...sampleRevisionRow,
        author_display_name: 'Test User',
        author_avatar_url: 'https://example.com/avatar.png',
      };
      const rev2WithAuthor: PostRevisionWithAuthorRow = {
        ...sampleRevisionRow,
        id: '880e8400-e29b-41d4-a716-446655440000',
        revision_number: 2,
        content: 'updated content',
        message: 'v2',
        author_display_name: 'Test User',
        author_avatar_url: 'https://example.com/avatar.png',
      };
      mockQuery.mockResolvedValueOnce({ rows: [rev2WithAuthor, rev1WithAuthor], rowCount: 2 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.revisions).toHaveLength(2);
      expect(body.revisions[0].revisionNumber).toBe(2);
      expect(body.revisions[1].revisionNumber).toBe(1);
      expect(body.revisions[0].authorId).toBe(userId);
      expect(body.revisions[0].authorDisplayName).toBe('Test User');
      expect(body.revisions[0].authorAvatarUrl).toBe('https://example.com/avatar.png');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  // ─── GET /api/posts/:id/revisions/:rev ─────────────────────────────

  describe('GET /api/posts/:id/revisions/:rev', () => {
    it('returns a specific revision', async () => {
      // findPostById to check existence
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/1`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.revision.revisionNumber).toBe(1);
      expect(body.revision.content).toBe('console.log("hello");');
    });

    it('returns 404 when revision not found', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevision returns null
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/99`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Revision not found');
    });

    it('returns 404 when post not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/1`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();
      expect(body.error).toBe('Post not found');
    });

    it('returns 400 for non-numeric revision number', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/revisions/abc`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error).toBe('Invalid revision number');
    });
  });

  // ─── POST /api/posts/:id/revisions/:rev/restore ─────────────────────

  describe('POST /api/posts/:id/revisions/:rev/restore', () => {
    it('restores a revision and returns 201 with new revision', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // findRevision (target revision to restore)
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // createRevisionAtomic (creates the restored revision)
      const restoredRow: PostRevisionRow = {
        ...sampleRevisionRow,
        id: '990e8400-e29b-41d4-a716-446655440099',
        revision_number: 2,
        message: 'Restored from revision 1',
      };
      mockQuery.mockResolvedValueOnce({ rows: [restoredRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.revision.revisionNumber).toBe(2);
      expect(body.revision.message).toBe('Restored from revision 1');
      expect(body.revision.content).toBe(sampleRevisionRow.content);

      // Verify broadcast
      expect(broadcastSpy).toHaveBeenCalledWith(
        `post:${postId}`,
        expect.objectContaining({ type: 'revision:new' }),
        undefined,
      );
    });

    it('returns 401 without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when post does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Post not found');
    });

    it('returns 403 when user is not the post author', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${otherToken}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('You can only restore revisions on your own posts');
    });

    it('returns 404 when target revision does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/999/restore`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Revision not found');
    });

    it('returns 400 for invalid revision number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/abc/restore`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Invalid revision number');
    });

    it('returns 400 for negative revision number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/-1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 400 for decimal revision number', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1.5/restore`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(400);
    });

    it('re-syncs prompt_variables when restoring a revision on a prompt post (#50)', async () => {
      const promptPost: PostRow = { ...samplePostRow, content_type: 'prompt' };
      const targetRevision: PostRevisionRow = {
        ...sampleRevisionRow,
        content: 'Restored: {{topic}}',
      };
      const restoredRow: PostRevisionRow = {
        ...targetRevision,
        id: '990e8400-e29b-41d4-a716-446655440050',
        revision_number: 3,
        message: 'Restored from revision 1',
      };
      const variableRow = {
        id: 'v050',
        post_id: postId,
        name: 'topic',
        placeholder: null,
        sort_order: 0,
        default_value: null,
      };

      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [promptPost], rowCount: 1 });
      // findRevision
      mockQuery.mockResolvedValueOnce({ rows: [targetRevision], rowCount: 1 });
      // createRevisionAtomic
      mockQuery.mockResolvedValueOnce({ rows: [restoredRow], rowCount: 1 });
      // syncVariablesFromContent: upsert 'topic'
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // syncVariablesFromContent: deleteStale
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // syncVariablesFromContent: findPromptVariablesByPostId
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'prompt' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [postId, 'topic', 0],
      );
    });

    it('broadcasts to feed channel when feedRow exists', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRevisionRow, revision_number: 2, message: 'Restored from revision 1' }],
        rowCount: 1,
      });
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
        undefined,
      );
    });

    it('skips feed broadcast when findFeedPostById returns null', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRevisionRow, revision_number: 2, message: 'Restored from revision 1' }],
        rowCount: 1,
      });
      mockFindFeedPostById.mockResolvedValueOnce(null);

      await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/revisions/1/restore`,
        headers: { authorization: `Bearer ${token}` },
      });

      // Only post channel broadcast, no feed broadcast
      expect(broadcastSpy).toHaveBeenCalledTimes(1);
      expect(broadcastSpy).toHaveBeenCalledWith(
        `post:${postId}`,
        expect.objectContaining({ type: 'revision:new' }),
        undefined,
      );
    });
  });

  // ─── POST /api/posts (link post creation) ────────────────────────

  describe('POST /api/posts — link post creation', () => {
    const sampleLinkPreview = {
      title: 'Example Site',
      description: 'A description',
      image: 'https://example.com/img.png',
      readingTime: 3,
    };

    const linkPostRow: PostRow = {
      ...samplePostRow,
      content_type: 'link',
      language: null,
      link_url: 'https://example.com/article',
      link_preview: sampleLinkPreview,
    };

    const linkPostPayload = {
      title: 'Link Post',
      contentType: 'link',
      linkUrl: 'https://example.com/article',
      visibility: 'public',
    };

    it('calls fetchLinkPreview and stores result when creating a link post', async () => {
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: linkPostPayload,
      });

      expect(response.statusCode).toBe(201);
      expect(mockFetchLinkPreview).toHaveBeenCalledWith('https://example.com/article');
      const body = response.json();
      expect(body.post.linkUrl).toBe('https://example.com/article');
      expect(body.post.linkPreview).toEqual(sampleLinkPreview);
    });

    it('creates link post with null linkPreview when fetch fails (graceful degradation)', async () => {
      mockFetchLinkPreview.mockResolvedValueOnce(null);
      const nullPreviewRow: PostRow = { ...linkPostRow, link_preview: null };
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [nullPreviewRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: linkPostPayload,
      });

      expect(response.statusCode).toBe(201);
      expect(mockFetchLinkPreview).toHaveBeenCalledWith('https://example.com/article');
      const body = response.json();
      expect(body.post.linkPreview).toBeNull();
    });

    it('returns 400 when contentType is link but linkUrl is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Link Post No URL',
          contentType: 'link',
          visibility: 'public',
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toContain('linkUrl is required');
    });

    it('uses linkUrl as revision content when content is not provided for link posts', async () => {
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // createRevision query — we check what content was passed
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRevisionRow, content: 'https://example.com/article' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: linkPostPayload, // no content field
      });

      expect(response.statusCode).toBe(201);
      // Verify createRevision was called with linkUrl as content
      // The second mockQuery call is createRevision
      const createRevisionCall = mockQuery.mock.calls[1];
      expect(createRevisionCall[1]).toContain('https://example.com/article');
    });

    it('uses provided content over linkUrl when both are present for link posts', async () => {
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRevisionRow, content: 'Custom description' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: { ...linkPostPayload, content: 'Custom description' },
      });

      expect(response.statusCode).toBe(201);
      // Verify createRevision was called with the provided content
      const createRevisionCall = mockQuery.mock.calls[1];
      expect(createRevisionCall[1]).toContain('Custom description');
    });

    it('does not call fetchLinkPreview for non-link posts', async () => {
      // createPost query
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
      // createRevision query
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

      const response = await app.inject({
        method: 'POST',
        url: '/api/posts',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          title: 'Snippet Post',
          contentType: 'snippet',
          language: 'typescript',
          visibility: 'public',
          content: 'console.log("hello");',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(mockFetchLinkPreview).not.toHaveBeenCalled();
    });
  });

  // ─── POST /api/posts/:id/refresh-preview ──────────────────────────

  describe('POST /api/posts/:id/refresh-preview', () => {
    const sampleLinkPreview = {
      title: 'Refreshed Title',
      description: 'Refreshed description',
      image: 'https://example.com/new-img.png',
      readingTime: 5,
    };

    const linkPostRow: PostRow = {
      ...samplePostRow,
      content_type: 'link',
      language: null,
      link_url: 'https://example.com/article',
      link_preview: { title: 'Old Title', description: 'Old', image: null, readingTime: 2 },
    };

    const updatedLinkPostRow: PostRow = {
      ...linkPostRow,
      link_preview: sampleLinkPreview,
      updated_at: new Date('2026-01-02'),
    };

    it('refreshes preview for author and returns 200', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // fetchLinkPreview
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // updateLinkPreview query
      mockQuery.mockResolvedValueOnce({ rows: [updatedLinkPostRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'link' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(mockFetchLinkPreview).toHaveBeenCalledWith('https://example.com/article');
      const body = response.json();
      expect(body.post.linkPreview).toEqual(sampleLinkPreview);
    });

    it('broadcasts post:updated on feed channel after refresh', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // fetchLinkPreview
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // updateLinkPreview query
      mockQuery.mockResolvedValueOnce({ rows: [updatedLinkPostRow], rowCount: 1 });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'link' });

      await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:updated', channel: 'feed' }),
      );
    });

    it('skips broadcast when findFeedPostById returns null', async () => {
      // findPostById
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });
      // fetchLinkPreview
      mockFetchLinkPreview.mockResolvedValueOnce(sampleLinkPreview);
      // updateLinkPreview query
      mockQuery.mockResolvedValueOnce({ rows: [updatedLinkPostRow], rowCount: 1 });
      // findFeedPostById returns null
      mockFindFeedPostById.mockResolvedValueOnce(null);

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(broadcastSpy).not.toHaveBeenCalled();
    });

    it('returns 403 for non-author', async () => {
      // findPostById — post belongs to userId, request from otherUserId
      mockQuery.mockResolvedValueOnce({ rows: [linkPostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${otherToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Only the author can refresh the link preview');
    });

    it('returns 400 for non-link post', async () => {
      // findPostById — samplePostRow has content_type='snippet'
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBe('Only link posts can have their preview refreshed');
    });

    it('returns 404 for nonexistent post', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Post not found');
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/refresh-preview`,
      });

      expect(response.statusCode).toBe(401);
    });
  });

  // ─── POST /api/posts/:id/fork ────────────────────────────────────

  describe('POST /api/posts/:id/fork', () => {
    const sourcePostRow: PostRow = {
      ...samplePostRow,
      visibility: 'public',
      is_draft: false,
      author_id: otherUserId, // source post belongs to another user
    };

    it('forks a post and returns 201 with the new post', async () => {
      // findPostById (source)
      mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
      // findPostWithLatestRevision (get latest revision content)
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...sourcePostRow,
            revision_id: 'rev-1',
            content: 'source code',
            revision_number: 1,
            message: 'init',
          },
        ],
        rowCount: 1,
      });
      // createForkedPost
      const forkedPostRow = {
        ...samplePostRow,
        forked_from_id: sourcePostRow.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      // createRevision (initial revision for fork)
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward: get source revisions)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: sourcePostRow.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId (file carry-forward: no files on source)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // findTagsByPostId (copy tags)
      mockQuery.mockResolvedValueOnce({ rows: [{ tag_id: 'tag-1' }], rowCount: 1 });
      // addPostTag
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-1' }],
        rowCount: 1,
      });
      // findFeedPostById for broadcast
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${sourcePostRow.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.post.forkedFromId).toBe(sourcePostRow.id);
      expect(body.post.authorId).toBe(userId);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 when source post does not exist', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
    });

    it('auto-syncs prompt_variables when forking a prompt post (#50)', async () => {
      const promptSource: PostRow = {
        ...sourcePostRow,
        content_type: 'prompt',
      };
      const variableRow = {
        id: 'v050',
        post_id: postId,
        name: 'goal',
        placeholder: null,
        sort_order: 0,
        default_value: null,
      };

      // findPostById (source)
      mockQuery.mockResolvedValueOnce({ rows: [promptSource], rowCount: 1 });
      // findPostWithLatestRevision
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...promptSource,
            revision_id: 'rev-1',
            content: 'Tell me about {{goal}}',
            revision_number: 1,
            message: 'init',
          },
        ],
        rowCount: 1,
      });
      // createForkedPost
      const forkedPostRow = {
        ...samplePostRow,
        content_type: 'prompt',
        forked_from_id: promptSource.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      // createRevision
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sampleRevisionRow, content: 'Tell me about {{goal}}' }],
        rowCount: 1,
      });
      // syncVariablesFromContent: upsert 'goal'
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // syncVariablesFromContent: deleteStale
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // syncVariablesFromContent: findPromptVariablesByPostId
      mockQuery.mockResolvedValueOnce({ rows: [variableRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: promptSource.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // tag query
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, content_type: 'prompt' });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${promptSource.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      // The variable was upserted on the FORKED post id
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/INSERT INTO prompt_variables/),
        [forkedPostRow.id, 'goal', 0],
      );
    });

    it('returns 403 when trying to fork own post', async () => {
      // samplePostRow has author_id = userId (same as token user)
      mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Cannot fork your own post');
    });

    it('returns 403 when source post is private', async () => {
      const privatePost = { ...sourcePostRow, visibility: 'private' };
      mockQuery.mockResolvedValueOnce({ rows: [privatePost], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe('Cannot fork a private post');
    });

    it('returns 403 when source post is a draft', async () => {
      const draftPost = { ...sourcePostRow, is_draft: true };
      mockQuery.mockResolvedValueOnce({ rows: [draftPost], rowCount: 1 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(403);
    });

    it('copies tags from source to forked post', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...sourcePostRow,
            revision_id: 'rev-1',
            content: 'code',
            revision_number: 1,
            message: null,
          },
        ],
        rowCount: 1,
      });
      const forkedPostRow = {
        ...samplePostRow,
        forked_from_id: sourcePostRow.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward: get source revisions)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: sourcePostRow.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId (file carry-forward: no files)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // Two tags
      mockQuery.mockResolvedValueOnce({
        rows: [{ tag_id: 'tag-1' }, { tag_id: 'tag-2' }],
        rowCount: 2,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-1' }],
        rowCount: 1,
      });
      mockQuery.mockResolvedValueOnce({
        rows: [{ post_id: forkedPostRow.id, tag_id: 'tag-2' }],
        rowCount: 1,
      });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${sourcePostRow.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      // Verify addPostTag was called for both tags
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [forkedPostRow.id, 'tag-1'],
      );
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [forkedPostRow.id, 'tag-2'],
      );
    });

    it('works when source post has no tags', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...sourcePostRow,
            revision_id: 'rev-1',
            content: 'code',
            revision_number: 1,
            message: null,
          },
        ],
        rowCount: 1,
      });
      const forkedPostRow = {
        ...samplePostRow,
        forked_from_id: sourcePostRow.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward: get source revisions)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: sourcePostRow.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId (file carry-forward: no files)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      // No tags
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${sourcePostRow.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
    });

    it('returns 404 when findPostWithLatestRevision returns null', async () => {
      // findPostById succeeds
      mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
      // findPostWithLatestRevision returns null (edge case: post exists but has no revisions)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${postId}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error).toBe('Post not found');
    });

    it('chain forking works — forking a fork sets forkedFromId to immediate parent', async () => {
      // Source post is itself a fork (has forked_from_id set)
      const chainSourcePost = { ...sourcePostRow, forked_from_id: 'grandparent-post-id' };
      mockQuery.mockResolvedValueOnce({ rows: [chainSourcePost], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...chainSourcePost,
            revision_id: 'rev-1',
            content: 'code',
            revision_number: 1,
            message: null,
          },
        ],
        rowCount: 1,
      });
      const forkedPostRow = {
        ...samplePostRow,
        forked_from_id: chainSourcePost.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward: get source revisions)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: chainSourcePost.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId (file carry-forward: no files)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockFindFeedPostById.mockResolvedValueOnce({
        ...sampleFeedRow,
        fork_count: 0,
        forked_from_title: null,
      });

      const response = await app.inject({
        method: 'POST',
        url: `/api/posts/${chainSourcePost.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(201);
      // forkedFromId points to the immediate parent, NOT the grandparent
      expect(response.json().post.forkedFromId).toBe(chainSourcePost.id);
    });

    it('broadcasts post:new on feed channel after fork', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sourcePostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            ...sourcePostRow,
            revision_id: 'rev-1',
            content: 'code',
            revision_number: 1,
            message: null,
          },
        ],
        rowCount: 1,
      });
      const forkedPostRow = {
        ...samplePostRow,
        forked_from_id: sourcePostRow.id,
        author_id: userId,
      };
      mockQuery.mockResolvedValueOnce({ rows: [forkedPostRow], rowCount: 1 });
      mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow], rowCount: 1 });
      // findRevisionsByPostId (file carry-forward: get source revisions)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 'rev-1', post_id: sourcePostRow.id, revision_number: 1 }],
        rowCount: 1,
      });
      // findFilesByRevisionId (file carry-forward: no files)
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      mockFindFeedPostById.mockResolvedValueOnce({ ...sampleFeedRow, fork_count: 0 });

      await app.inject({
        method: 'POST',
        url: `/api/posts/${sourcePostRow.id}/fork`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(broadcastSpy).toHaveBeenCalledWith(
        'feed',
        expect.objectContaining({ type: 'post:new', channel: 'feed' }),
        undefined,
      );
    });
  });

  // ─── Video post extensions (WU5b 5.1, 5.9, 5.10, 5.13) ──────────────────
  describe('video post extensions', () => {
    const videoPostRow: PostRow = {
      ...samplePostRow,
      content_type: 'video',
      visibility: 'public',
      is_draft: true,
    };

    describe('POST /api/posts — video', () => {
      it('5.1: creates a video post with empty initial revision (no content)', async () => {
        const insertedVideoPost = { ...videoPostRow };
        // createPost
        mockQuery.mockResolvedValueOnce({ rows: [insertedVideoPost], rowCount: 1 });
        // createRevision (empty content)
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...sampleRevisionRow, content: '' }],
          rowCount: 1,
        });
        // findFeedPostById
        mockFindFeedPostById.mockResolvedValueOnce({
          ...sampleFeedRow,
          content_type: 'video',
        });

        const response = await app.inject({
          method: 'POST',
          url: '/api/posts',
          headers: { authorization: `Bearer ${token}` },
          payload: { title: 'My video', contentType: 'video', visibility: 'public' },
        });

        expect(response.statusCode).toBe(201);
        const body = response.json();
        expect(body.post.contentType).toBe('video');
        expect(body.revision.content).toBe('');
        // createRevision called with content=''
        expect(mockQuery).toHaveBeenCalledWith(
          expect.stringMatching(/INSERT INTO post_revisions/),
          [insertedVideoPost.id, userId, '', null, 1],
        );
      });

      it('5.1: rejects video post create with non-empty content (400 VALIDATION_FAILED)', async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/api/posts',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            title: 'Bad video',
            contentType: 'video',
            visibility: 'public',
            content: 'hi',
          },
        });

        expect(response.statusCode).toBe(400);
        // No DB write — schema rejects before route work
        expect(mockQuery).not.toHaveBeenCalledWith(
          expect.stringMatching(/INSERT INTO posts/),
          expect.any(Array),
        );
      });
    });

    describe('PATCH /api/posts/:id — visibility-flip SAGA (5.9)', () => {
      it('routes video visibility change through videoPipeline.flipVisibility (happy path)', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-abc',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const flipSpy = vi
          .spyOn(app.videoPipeline, 'flipVisibility')
          .mockResolvedValueOnce(undefined);

        // findPostById — public video
        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        // updatePost
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...videoPostRow, visibility: 'private' }],
          rowCount: 1,
        });
        mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        expect(response.statusCode).toBe(200);
        expect(flipSpy).toHaveBeenCalledWith({
          postId,
          from: 'public',
          to: 'private',
          cfUid: 'cf-abc',
        });

        flipSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('returns 502 with VIDEO_VISIBILITY_FLIP_FAILED envelope on CF failure', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-abc',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const flipSpy = vi
          .spyOn(app.videoPipeline, 'flipVisibility')
          .mockRejectedValueOnce(new Error('VIDEO_VISIBILITY_FLIP_FAILED: cf 500'));

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        expect(response.statusCode).toBe(502);
        const body = response.json();
        expect(body.code).toBe('VIDEO_VISIBILITY_FLIP_FAILED');
        expect(body.error).toBe('Could not change visibility');
        expect(body.details.cause).toContain('VIDEO_VISIBILITY_FLIP_FAILED');

        flipSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('returns 502 when flip throws a non-Error with VIDEO_VISIBILITY_FLIP_FAILED string', async () => {
        // err instanceof Error is false here → message becomes the 'unknown'
        // fallback. The if-branch then bails since message does not include
        // VIDEO_VISIBILITY_FLIP_FAILED — surfaces 500 instead.
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-abc',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const flipSpy = vi
          .spyOn(app.videoPipeline, 'flipVisibility')
          // Throw a non-Error (string) so the `err instanceof Error` ternary
          // hits the `: 'unknown'` branch.
          .mockImplementationOnce(() => {
            throw 'not an error object';
          });

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        // The fallback message 'unknown' does NOT include VIDEO_VISIBILITY_FLIP_FAILED,
        // so the catch rethrows → Fastify returns 500.
        expect(response.statusCode).toBe(500);

        flipSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('rethrows unrelated errors so they surface as 500', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-abc',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const flipSpy = vi
          .spyOn(app.videoPipeline, 'flipVisibility')
          .mockRejectedValueOnce(new Error('something else went wrong'));

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        expect(response.statusCode).toBe(500);

        flipSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('skips SAGA when no post_videos row exists', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce(null);
        const flipSpy = vi.spyOn(app.videoPipeline, 'flipVisibility');

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...videoPostRow, visibility: 'private' }],
          rowCount: 1,
        });
        mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        expect(response.statusCode).toBe(200);
        expect(flipSpy).not.toHaveBeenCalled();

        flipSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('non-video posts are unaffected by the SAGA branch', async () => {
        const flipSpy = vi.spyOn(app.videoPipeline, 'flipVisibility');

        // findPostById — snippet
        mockQuery.mockResolvedValueOnce({ rows: [samplePostRow], rowCount: 1 });
        // updatePost
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...samplePostRow, visibility: 'private' }],
          rowCount: 1,
        });
        mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { visibility: 'private' },
        });

        expect(response.statusCode).toBe(200);
        expect(flipSpy).not.toHaveBeenCalled();

        flipSpy.mockRestore();
      });

      it('does NOT trigger SAGA when visibility unchanged on a video post', async () => {
        const flipSpy = vi.spyOn(app.videoPipeline, 'flipVisibility');

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        mockQuery.mockResolvedValueOnce({
          rows: [{ ...videoPostRow, title: 'New title' }],
          rowCount: 1,
        });
        mockFindFeedPostById.mockResolvedValueOnce(sampleFeedRow);

        const response = await app.inject({
          method: 'PATCH',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
          payload: { title: 'New title' },
        });

        expect(response.statusCode).toBe(200);
        expect(flipSpy).not.toHaveBeenCalled();

        flipSpy.mockRestore();
      });
    });

    describe('DELETE /api/posts/:id — video (5.10)', () => {
      it('calls cf.deleteAsset(cfUid) BEFORE the DB delete', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-xyz',
          pendingCfUid: 'cf-pending',
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const deleteAssetSpy = vi
          .spyOn(app.cloudflareStream, 'deleteAsset')
          .mockResolvedValue(undefined);

        // findPostById
        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        // softDeletePost
        mockQuery.mockResolvedValueOnce({ rows: [{ id: postId }], rowCount: 1 });

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(204);
        expect(deleteAssetSpy).toHaveBeenCalledWith('cf-xyz');
        expect(deleteAssetSpy).toHaveBeenCalledWith('cf-pending');

        deleteAssetSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('logs warn on CF failure but still removes the post', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-xyz',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const deleteAssetSpy = vi
          .spyOn(app.cloudflareStream, 'deleteAsset')
          .mockRejectedValueOnce(new Error('cf 500'));
        const warnSpy = vi.spyOn(app.log, 'warn');

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: postId }], rowCount: 1 });

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(204);
        const orphanCall = warnSpy.mock.calls.find(
          (args) => (args[0] as { event?: string })?.event === 'video.pipeline.orphan-cf-asset',
        );
        expect(orphanCall, 'expected video.pipeline.orphan-cf-asset warn log').toBeDefined();

        deleteAssetSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });

      it('skips CF call entirely when no post_videos row exists', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce(null);
        const deleteAssetSpy = vi.spyOn(app.cloudflareStream, 'deleteAsset');

        mockQuery.mockResolvedValueOnce({ rows: [videoPostRow], rowCount: 1 });
        mockQuery.mockResolvedValueOnce({ rows: [{ id: postId }], rowCount: 1 });

        const response = await app.inject({
          method: 'DELETE',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(204);
        expect(deleteAssetSpy).not.toHaveBeenCalled();

        deleteAssetSpy.mockRestore();
        getPostVideoSpy.mockRestore();
      });
    });

    describe('GET /api/posts/:id — video field (5.13)', () => {
      const videoPostWithRevision: PostWithRevisionRow = {
        ...videoPostRow,
        revision_id: '880e8400-e29b-41d4-a716-446655440111',
        content: '',
        revision_number: 1,
        message: null,
        tags: null,
      };

      it('owner sees full video object with cfUid + pendingCfUid', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-owner',
          pendingCfUid: 'cf-pending',
          status: 'ready',
          durationSec: 100,
          sizeBytes: 999,
          transcript: 'ts',
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        // findPostWithLatestRevision (owner request)
        mockQuery.mockResolvedValueOnce({
          rows: [videoPostWithRevision],
          rowCount: 1,
        });

        const response = await app.inject({
          method: 'GET',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.post.video).toEqual({
          status: 'ready',
          cfUid: 'cf-owner',
          pendingCfUid: 'cf-pending',
          lastError: null,
          playbackRequiresSignedUrl: false,
        });

        getPostVideoSpy.mockRestore();
      });

      it('non-owner of public video sees only { status, pendingReplacement }', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-secret',
          pendingCfUid: 'cf-pending-secret',
          status: 'ready',
          durationSec: 100,
          sizeBytes: 999,
          transcript: 'ts',
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockQuery.mockResolvedValueOnce({
          rows: [videoPostWithRevision],
          rowCount: 1,
        });

        const response = await app.inject({
          method: 'GET',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${otherToken}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.post.video).toEqual({ status: 'ready', pendingReplacement: true });
        expect(body.post.video.cfUid).toBeUndefined();
        expect(body.post.video.pendingCfUid).toBeUndefined();

        getPostVideoSpy.mockRestore();
      });

      it('non-owner with no pending replacement sees pendingReplacement=false', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce({
          postId,
          cfUid: 'cf-x',
          pendingCfUid: null,
          status: 'ready',
          durationSec: null,
          sizeBytes: null,
          transcript: null,
          playbackRequiresSignedUrl: false,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });

        mockQuery.mockResolvedValueOnce({
          rows: [videoPostWithRevision],
          rowCount: 1,
        });

        const response = await app.inject({
          method: 'GET',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${otherToken}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.post.video).toEqual({ status: 'ready', pendingReplacement: false });

        getPostVideoSpy.mockRestore();
      });

      it('non-video posts have no video field', async () => {
        mockQuery.mockResolvedValueOnce({
          rows: [samplePostWithRevisionRow],
          rowCount: 1,
        });

        const response = await app.inject({
          method: 'GET',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.post.video).toBeUndefined();
      });

      it('video post without post_videos row omits the video field', async () => {
        const videoQ = await import('../../db/queries/video.js');
        const getPostVideoSpy = vi.spyOn(videoQ, 'getPostVideo').mockResolvedValueOnce(null);

        mockQuery.mockResolvedValueOnce({
          rows: [videoPostWithRevision],
          rowCount: 1,
        });

        const response = await app.inject({
          method: 'GET',
          url: `/api/posts/${postId}`,
          headers: { authorization: `Bearer ${token}` },
        });

        expect(response.statusCode).toBe(200);
        const body = response.json();
        expect(body.post.video).toBeUndefined();

        getPostVideoSpy.mockRestore();
      });
    });
  });
});
