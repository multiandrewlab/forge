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

  beforeEach(async () => {
    app = await buildApp();
    await app.register(playgroundRoutes, { prefix: '/api' });
    await app.ready();
    authToken = app.jwt.sign({
      id: TEST_USER_ID,
      email: 'testuser@example.com',
      displayName: 'Test User',
    });
    mockGetVariablesForPost.mockReset();
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

  beforeEach(async () => {
    app = await buildApp();
    await app.register(playgroundRoutes, { prefix: '/api' });
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
});
