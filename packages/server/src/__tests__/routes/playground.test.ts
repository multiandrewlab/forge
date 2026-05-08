import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks — declared BEFORE imports
vi.mock('../../db/connection.js', () => ({ query: vi.fn() }));
vi.mock('../../plugins/rate-limit.js', () => ({ rateLimitPlugin: async () => {} }));

const mockGetVariablesForPost = vi.fn();
const mockAssemblePromptForPost = vi.fn();
vi.mock('../../services/playground.js', () => ({
  getVariablesForPost: (...args: unknown[]) => mockGetVariablesForPost(...args),
  assemblePromptForPost: (...args: unknown[]) => mockAssemblePromptForPost(...args),
}));

const mockFindPostById = vi.fn();
vi.mock('../../db/queries/posts.js', () => ({
  findPostById: (...args: unknown[]) => mockFindPostById(...args),
}));

const mockFindRevisionsByPostId = vi.fn();
vi.mock('../../db/queries/revisions.js', () => ({
  findRevisionsByPostId: (...args: unknown[]) => mockFindRevisionsByPostId(...args),
}));

const mockCreatePlaygroundChain = vi.fn().mockReturnValue({});
const mockStreamPlayground = vi.fn();
vi.mock('../../plugins/langchain/chains/playground.js', () => ({
  createPlaygroundChain: (...args: unknown[]) => mockCreatePlaygroundChain(...args),
  streamPlayground: (...args: unknown[]) => mockStreamPlayground(...args),
}));

vi.mock('../../plugins/langchain/provider.js', () => ({
  createChatModel: vi.fn().mockReturnValue({} as never),
}));

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { buildApp } from '../../app.js';
import { playgroundRoutes } from '../../routes/playground.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const TEST_USER_ID = 'a0000000-0000-0000-0000-000000000099';
const TEST_POST_ID = 'c0000000-0000-0000-0000-000000000004';

async function* streamOf(chunks: string[]) {
  for (const c of chunks) yield c;
}

async function* streamWithError() {
  yield 'partial';
  throw new Error('stream exploded');
}

describe('GET /api/posts/:id/variables', () => {
  let app: FastifyInstance;
  let authToken: string;

  // Default post fixture for the GET variables route: a public testuser-owned
  // post. Individual tests override `visibility` / `author_id` to exercise the
  // assertCanReadPost guard.
  const PUBLIC_POST_ROW = {
    id: TEST_POST_ID,
    author_id: TEST_USER_ID,
    title: 'Variables Test Post',
    content_type: 'prompt',
    language: null,
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
  };
  const OTHER_USER_ID = 'a0000000-0000-0000-0000-000000000003';

  beforeEach(async () => {
    app = await buildApp();

    await app.ready();
    authToken = app.jwt.sign({
      id: TEST_USER_ID,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
    mockGetVariablesForPost.mockReset();
    mockFindPostById.mockReset();
    mockFindPostById.mockResolvedValue(PUBLIC_POST_ROW);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 404 when post does not exist', async () => {
    mockFindPostById.mockResolvedValue(null);
    mockGetVariablesForPost.mockResolvedValue([]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(404);
    const body = JSON.parse(res.payload) as { code?: string };
    expect(body.code).toBe('POST_NOT_FOUND');
    // Variables query must not run after a 404 — no enumeration of a missing post.
    expect(mockGetVariablesForPost).not.toHaveBeenCalled();
  });

  it('returns 403 when post is private and caller is not the owner', async () => {
    mockFindPostById.mockResolvedValue({
      ...PUBLIC_POST_ROW,
      author_id: OTHER_USER_ID,
      visibility: 'private',
    });
    // Reproduce prod behavior: variable names exist and would leak without the guard.
    mockGetVariablesForPost.mockResolvedValue([
      {
        id: 'leaked-1',
        post_id: TEST_POST_ID,
        name: 'secret_var_name',
        placeholder: null,
        default_value: null,
        sort_order: 0,
      },
    ]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.payload) as { error?: string; variables?: unknown[] };
    expect(body.error).toBe('This post is private');
    // Variable names must NOT be enumerable for non-owners.
    expect(body.variables).toBeUndefined();
    expect(mockGetVariablesForPost).not.toHaveBeenCalled();
  });

  it('returns 200 when post is private and caller is the owner', async () => {
    mockFindPostById.mockResolvedValue({
      ...PUBLIC_POST_ROW,
      visibility: 'private',
    });
    mockGetVariablesForPost.mockResolvedValue([]);
    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
      headers: { authorization: `Bearer ${authToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { variables: unknown[] };
    expect(body.variables).toEqual([]);
  });

  it('returns 200 with camelCase mapped variables', async () => {
    mockGetVariablesForPost.mockResolvedValue([
      {
        id: 'v1',
        post_id: TEST_POST_ID,
        name: 'topic',
        placeholder: 'Enter topic',
        default_value: 'AI',
        sort_order: 0,
      },
      {
        id: 'v2',
        post_id: TEST_POST_ID,
        name: 'tone',
        placeholder: null,
        default_value: null,
        sort_order: 1,
      },
    ]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as {
      variables: Array<{
        id: string;
        postId: string;
        name: string;
        placeholder: string | null;
        defaultValue: string | null;
        sortOrder: number;
      }>;
    };
    expect(body.variables).toEqual([
      {
        id: 'v1',
        postId: TEST_POST_ID,
        name: 'topic',
        placeholder: 'Enter topic',
        defaultValue: 'AI',
        sortOrder: 0,
      },
      {
        id: 'v2',
        postId: TEST_POST_ID,
        name: 'tone',
        placeholder: null,
        defaultValue: null,
        sortOrder: 1,
      },
    ]);
    expect(mockGetVariablesForPost).toHaveBeenCalledWith(TEST_POST_ID);
  });

  it('returns empty array for post with no variables', async () => {
    mockGetVariablesForPost.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: `/api/posts/${TEST_POST_ID}/variables`,
      headers: { authorization: `Bearer ${authToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload) as { variables: unknown[] };
    expect(body.variables).toEqual([]);
  });
});

describe('POST /api/playground/run', () => {
  let app: FastifyInstance;
  let authToken: string;

  // Default fixture: a public prompt post owned by testuser with NO required vars
  // (all template vars have defaults). This keeps existing tests focused on
  // streaming behaviour, not on the new validation pipeline.
  const DEFAULT_POST_ROW = {
    id: TEST_POST_ID,
    author_id: TEST_USER_ID,
    title: 'Default Test Prompt',
    content_type: 'prompt',
    language: null,
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
  };
  const DEFAULT_REVISION_ROW = {
    id: 'd0000000-0000-0000-0000-000000000005',
    post_id: TEST_POST_ID,
    author_id: TEST_USER_ID,
    content: 'No vars here, just a static prompt body.',
    message: null,
    revision_number: 1,
    created_at: new Date('2026-01-01'),
  };

  beforeEach(async () => {
    app = await buildApp();

    await app.ready();
    authToken = app.jwt.sign({
      id: TEST_USER_ID,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
    mockStreamPlayground.mockReset();
    mockAssemblePromptForPost.mockReset();
    mockCreatePlaygroundChain.mockReset();
    mockCreatePlaygroundChain.mockReturnValue({});
    mockFindPostById.mockReset();
    mockFindRevisionsByPostId.mockReset();
    mockGetVariablesForPost.mockReset();
    // Default: post exists, has a no-var revision, no variable metadata.
    mockFindPostById.mockResolvedValue(DEFAULT_POST_ROW);
    mockFindRevisionsByPostId.mockResolvedValue([DEFAULT_REVISION_ROW]);
    mockGetVariablesForPost.mockResolvedValue([]);
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 401 without auth', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      payload: { postId: TEST_POST_ID, variables: {} },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid body (missing postId)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { variables: { key: 'val' } },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('returns 400 for invalid postId (not a UUID)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: 'not-a-uuid', variables: {} },
    });
    expect(res.statusCode).toBe(400);
  });

  it('streams SSE token events and ends with done on success', async () => {
    mockAssemblePromptForPost.mockResolvedValue('Hello {{topic}}, tell me about AI');
    mockStreamPlayground.mockImplementation(() => streamOf(['Hello ', 'world']));

    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: { topic: 'AI' } },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.payload).toContain('event: token\ndata: {"text":"Hello "}');
    expect(res.payload).toContain('event: token\ndata: {"text":"world"}');
    expect(res.payload).toContain('event: done\ndata: {}');
  });

  it('emits SSE error event when assembly fails', async () => {
    mockAssemblePromptForPost.mockRejectedValue(new Error('Post not found'));

    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('Post not found');
  });

  it('emits SSE error event when stream fails mid-generation', async () => {
    mockAssemblePromptForPost.mockResolvedValue('assembled prompt');
    mockStreamPlayground.mockImplementation(() => streamWithError());

    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: token\ndata: {"text":"partial"}');
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('stream exploded');
  });

  it('falls back to stream_error message when non-Error is thrown', async () => {
    mockAssemblePromptForPost.mockResolvedValue('assembled prompt');
    mockStreamPlayground.mockImplementation(() => {
      return (async function* () {
        yield 'x';
        throw 'something weird';
      })();
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });

    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('stream_error');
  });

  it('returns 500 when aiSlot is missing (defensive guard)', async () => {
    const minimal = Fastify();
    await minimal.register(fastifyJwt, { secret: 'test-secret' });
    minimal.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        await req.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    });
    minimal.decorate('aiProvider', () => ({}) as never);
    minimal.decorate('aiGate', [(minimal as unknown as { authenticate: never }).authenticate]);
    await minimal.register(playgroundRoutes, { prefix: '/api' });
    await minimal.ready();

    const token = minimal.jwt.sign({
      id: TEST_USER_ID,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
    const res = await minimal.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${token}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload)).toEqual({ error: 'internal_error' });
    await minimal.close();
  });

  it('threads AbortSignal to streamPlayground', async () => {
    mockAssemblePromptForPost.mockResolvedValue('assembled prompt');
    mockStreamPlayground.mockImplementation(() => streamOf(['ok']));

    const res = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });

    expect(res.statusCode).toBe(200);
    expect(mockStreamPlayground).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamPlayground.mock.calls[0] as unknown[];
    const opts = callArgs[2] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
  });

  it('passes assembled prompt to createPlaygroundChain and streamPlayground', async () => {
    const assembledText = 'Tell me about AI in formal tone';
    mockAssemblePromptForPost.mockResolvedValue(assembledText);
    mockStreamPlayground.mockImplementation(() => streamOf(['result']));

    await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: { topic: 'AI' } },
    });

    expect(mockAssemblePromptForPost).toHaveBeenCalledWith(TEST_POST_ID, { topic: 'AI' });
    expect(mockStreamPlayground).toHaveBeenCalledTimes(1);
    const callArgs = mockStreamPlayground.mock.calls[0] as unknown[];
    expect(callArgs[1]).toEqual({ prompt: assembledText });
  });

  it('returns 429 for concurrent second request', async () => {
    mockAssemblePromptForPost.mockResolvedValue('prompt');
    mockStreamPlayground.mockImplementationOnce(async function* () {
      yield 'slow';
      await new Promise((r) => setTimeout(r, 1000));
    });

    const first = app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });
    await new Promise((r) => setImmediate(r));

    const second = await app.inject({
      method: 'POST',
      url: '/api/playground/run',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { postId: TEST_POST_ID, variables: {} },
    });
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBe('5');

    await first;
  });

  describe('missing-required-variables validation', () => {
    // Fixtures mirror the real seed (#50): a public prompt post owned by testuser
    // with one NULL-default variable named `required_name` and content
    // 'Hello {{required_name}}!'.
    const REQUIRED_VAR_FIXTURE_POST_ID = 'c0000000-0000-0000-0000-000000000050';
    const DEMO_PROMPT_POST_ID = 'c0000000-0000-0000-0000-000000000004';
    // For case 10 (caller cannot read post → 403): a private post owned by a
    // different user. Mirrors real seed row c0000000-...-000000000006 but is
    // injected via mock here since this is a unit test.
    const PRIVATE_NOT_READABLE_POST_ID = 'c0000000-0000-0000-0000-000000000006';
    const OTHER_USER_ID = 'a0000000-0000-0000-0000-000000000003';

    const requiredVarPostRow = {
      id: REQUIRED_VAR_FIXTURE_POST_ID,
      author_id: TEST_USER_ID,
      title: 'Required-var Fixture',
      content_type: 'prompt',
      language: null,
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
    };
    const requiredVarRevisionRow = {
      id: 'd0000000-0000-0000-0000-000000000050',
      post_id: REQUIRED_VAR_FIXTURE_POST_ID,
      author_id: TEST_USER_ID,
      content: 'Hello {{required_name}}!',
      message: 'Initial fixture for #50',
      revision_number: 1,
      created_at: new Date('2026-01-01'),
    };
    const requiredVarRow = {
      id: 'f0000000-0000-0000-0000-000000000050',
      post_id: REQUIRED_VAR_FIXTURE_POST_ID,
      name: 'required_name',
      placeholder: 'e.g., world',
      sort_order: 0,
      default_value: null,
    };
    const demoPostRow = { ...requiredVarPostRow, id: DEMO_PROMPT_POST_ID };
    const demoRevisionRow = {
      ...requiredVarRevisionRow,
      id: 'd0000000-0000-0000-0000-000000000005',
      post_id: DEMO_PROMPT_POST_ID,
      content:
        'Generate a React component with the following requirements: {{component_name}}, {{props}}, {{features}}',
    };
    const demoVarsAllDefaulted = [
      {
        id: 'f0000000-0000-0000-0000-000000000001',
        post_id: DEMO_PROMPT_POST_ID,
        name: 'component_name',
        placeholder: 'e.g., UserProfile',
        sort_order: 0,
        default_value: 'MyComponent',
      },
      {
        id: 'f0000000-0000-0000-0000-000000000002',
        post_id: DEMO_PROMPT_POST_ID,
        name: 'props',
        placeholder: null,
        sort_order: 1,
        default_value: 'name: string, age: number',
      },
      {
        id: 'f0000000-0000-0000-0000-000000000003',
        post_id: DEMO_PROMPT_POST_ID,
        name: 'features',
        placeholder: null,
        sort_order: 2,
        default_value: 'responsive, accessible',
      },
    ];
    const privateNotReadablePostRow = {
      ...requiredVarPostRow,
      id: PRIVATE_NOT_READABLE_POST_ID,
      author_id: OTHER_USER_ID,
      visibility: 'private',
    };

    beforeEach(() => {
      // Default for these cases: required-var fixture post is the target.
      mockFindPostById.mockResolvedValue(requiredVarPostRow);
      mockFindRevisionsByPostId.mockResolvedValue([requiredVarRevisionRow]);
      mockGetVariablesForPost.mockResolvedValue([requiredVarRow]);
      mockAssemblePromptForPost.mockResolvedValue('Hello world!');
      mockStreamPlayground.mockImplementation(() => streamOf(['ok']));
    });

    it('case 1: missing single required var → 400 with code + missing[required_name]', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload) as {
        error: string;
        code: string;
        missing: string[];
      };
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
      expect(body.missing).toEqual(['required_name']);
      expect(body.error).toMatch(/^Missing required variables/);
    });

    it('case 2: missing multiple required vars → 400 with all missing names', async () => {
      // Inline fixture with TWO NULL-default required vars to exercise the
      // multi-name path. (Seed only ships one such fixture; multi-missing is
      // also covered by extractRequiredVariables unit tests.)
      const twoVarPostId = 'c0000000-0000-0000-0000-000000000051';
      mockFindPostById.mockResolvedValue({ ...requiredVarPostRow, id: twoVarPostId });
      mockFindRevisionsByPostId.mockResolvedValue([
        {
          ...requiredVarRevisionRow,
          post_id: twoVarPostId,
          content: 'Hi {{first_name}} {{last_name}}!',
        },
      ]);
      mockGetVariablesForPost.mockResolvedValue([
        { ...requiredVarRow, name: 'first_name', post_id: twoVarPostId },
        { ...requiredVarRow, name: 'last_name', post_id: twoVarPostId },
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: twoVarPostId, variables: {} },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload) as {
        code: string;
        missing: string[];
      };
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
      expect(body.missing.sort()).toEqual(['first_name', 'last_name']);
    });

    it('case 3: all required vars present → 200 + SSE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { required_name: 'world' },
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    });

    it('case 4: all vars empty → 400 with all in missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { required_name: '' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload) as {
        code: string;
        missing: string[];
      };
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
      expect(body.missing).toEqual(['required_name']);
    });

    it('case 5: partial fill across multiple required vars → 400 with only the unfilled name', async () => {
      // Same inline 2-var fixture as case 2, but submit ONLY first_name.
      // Asserts the "still missing" array contains last_name and excludes
      // the var the caller did supply.
      const twoVarPostId = 'c0000000-0000-0000-0000-000000000051';
      mockFindPostById.mockResolvedValue({ ...requiredVarPostRow, id: twoVarPostId });
      mockFindRevisionsByPostId.mockResolvedValue([
        {
          ...requiredVarRevisionRow,
          post_id: twoVarPostId,
          content: 'Hi {{first_name}} {{last_name}}!',
        },
      ]);
      mockGetVariablesForPost.mockResolvedValue([
        { ...requiredVarRow, name: 'first_name', post_id: twoVarPostId },
        { ...requiredVarRow, name: 'last_name', post_id: twoVarPostId },
      ]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: twoVarPostId,
          variables: { first_name: 'Andrew' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload) as {
        code: string;
        missing: string[];
      };
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
      expect(body.missing).toEqual(['last_name']);
    });

    it('case 6: defaultValue present + submitted value empty → request proceeds', async () => {
      // Demo prompt: all vars defaulted, submit empty → all required-checks pass.
      mockFindPostById.mockResolvedValue(demoPostRow);
      mockFindRevisionsByPostId.mockResolvedValue([demoRevisionRow]);
      mockGetVariablesForPost.mockResolvedValue(demoVarsAllDefaulted);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: DEMO_PROMPT_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    });

    it('case 7: template has no {{vars}} → request proceeds', async () => {
      mockFindRevisionsByPostId.mockResolvedValue([
        { ...requiredVarRevisionRow, content: 'A static prompt with no template variables.' },
      ]);
      mockGetVariablesForPost.mockResolvedValue([]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(200);
    });

    it('case 8: submitted vars include extras not in template → ignored, request proceeds', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { required_name: 'world', extra: 'ignored' },
        },
      });
      expect(res.statusCode).toBe(200);
    });

    it('case 9: whitespace-only submitted value → treated as empty', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { required_name: '   ' },
        },
      });
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload) as { code: string };
      expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
    });

    it('case 10: caller cannot read source post → 403, no missing field', async () => {
      mockFindPostById.mockResolvedValue(privateNotReadablePostRow);
      mockFindRevisionsByPostId.mockResolvedValue([
        { ...requiredVarRevisionRow, post_id: PRIVATE_NOT_READABLE_POST_ID },
      ]);
      mockGetVariablesForPost.mockResolvedValue([]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: PRIVATE_NOT_READABLE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.payload) as {
        error?: string;
        code?: string;
        missing?: string[];
      };
      expect(body.missing).toBeUndefined();
      expect(body.code).toBeUndefined();
    });

    it('case 11: 400 response is application/json, never SSE', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toMatch(/application\/json/);
      expect(res.headers['content-type']).not.toMatch(/text\/event-stream/);
    });

    it('returns 404 when post does not exist (defensive guard)', async () => {
      mockFindPostById.mockResolvedValue(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload) as { code: string };
      expect(body.code).toBe('POST_NOT_FOUND');
    });

    it('returns 404 when post has no revisions (defensive guard)', async () => {
      mockFindRevisionsByPostId.mockResolvedValue([]);
      const res = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload) as { code: string };
      expect(body.code).toBe('POST_NOT_FOUND');
    });

    it('case 12: rate-limit slot released after validation 400', async () => {
      const r1 = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: { postId: REQUIRED_VAR_FIXTURE_POST_ID, variables: {} },
      });
      expect(r1.statusCode).toBe(400);
      // Second request must succeed — the onResponse hook should have
      // released the AI slot acquired in the aiGate preHandler. Asserting
      // exactly 200 (not just "not 429") catches regressions that fail
      // the second call with 400/500/etc. after slot release works.
      const r2 = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${authToken}` },
        payload: {
          postId: REQUIRED_VAR_FIXTURE_POST_ID,
          variables: { required_name: 'world' },
        },
      });
      expect(r2.statusCode).toBe(200);
    });
  });
});
