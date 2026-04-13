import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mocks — declared BEFORE imports
vi.mock('../../db/connection.js', () => ({ query: vi.fn() }));
vi.mock('../../plugins/rate-limit.js', () => ({ rateLimitPlugin: async () => {} }));

const mockStream = vi.fn();
vi.mock('../../plugins/langchain/chains/autocomplete.js', async () => {
  const actual = await vi.importActual<object>('../../plugins/langchain/chains/autocomplete.js');
  return {
    ...actual,
    streamAutocomplete: (...args: unknown[]) => mockStream(...args),
    createAutocompleteChain: vi.fn().mockReturnValue({ stream: vi.fn() }),
  };
});

const mockGenerateStream = vi.fn();
const mockCreateGenerateChain = vi.fn().mockReturnValue({ stream: vi.fn() });
vi.mock('../../plugins/langchain/chains/generate.js', async () => {
  const actual = await vi.importActual<object>('../../plugins/langchain/chains/generate.js');
  return {
    ...actual,
    streamGenerate: (...args: unknown[]) => mockGenerateStream(...args),
    createGenerateChain: (...args: unknown[]) => mockCreateGenerateChain(...args),
  };
});
vi.mock('../../plugins/langchain/provider.js', () => ({
  createChatModel: vi.fn().mockReturnValue({} as never),
}));

import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { buildApp } from '../../app.js';
import { aiRoutes, createAbortHandlers } from '../../routes/ai.js';
import { EventEmitter } from 'node:events';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

async function* streamOf(chunks: string[]) {
  for (const c of chunks) yield c;
}

async function* streamWithError() {
  yield 'a';
  throw new Error('model exploded');
}

async function* generateStreamOf(chunks: string[]) {
  for (const c of chunks) yield c;
}

async function* generateStreamWithError() {
  yield 'partial';
  throw new Error('generate chain exploded');
}

describe('createAbortHandlers', () => {
  it('aborts the slot after the 60s timeout elapses', () => {
    vi.useFakeTimers();
    const slot = { controller: new AbortController() };
    const fakeRaw = new EventEmitter();
    const fakeReq = { raw: fakeRaw } as unknown as FastifyRequest;
    const cleanup = createAbortHandlers(fakeReq, slot, 60_000);
    expect(slot.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(60_001);
    expect(slot.controller.signal.aborted).toBe(true);
    cleanup();
    vi.useRealTimers();
  });

  it('aborts the slot when the client closes the connection', () => {
    const slot = { controller: new AbortController() };
    const fakeRaw = new EventEmitter();
    const fakeReq = { raw: fakeRaw } as unknown as FastifyRequest;
    const cleanup = createAbortHandlers(fakeReq, slot, 60_000);
    fakeRaw.emit('close');
    expect(slot.controller.signal.aborted).toBe(true);
    cleanup();
  });

  it('cleanup() prevents the timeout from firing and detaches the listener', () => {
    vi.useFakeTimers();
    const slot = { controller: new AbortController() };
    const fakeRaw = new EventEmitter();
    const fakeReq = { raw: fakeRaw } as unknown as FastifyRequest;
    const cleanup = createAbortHandlers(fakeReq, slot, 60_000);
    cleanup();
    vi.advanceTimersByTime(60_001);
    expect(slot.controller.signal.aborted).toBe(false);
    fakeRaw.emit('close');
    expect(slot.controller.signal.aborted).toBe(false);
    vi.useRealTimers();
  });
});

describe('POST /api/ai/complete', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    authToken = app.jwt.sign({ id: 'u1', email: 'u1@example.com', displayName: 'U1' });
    mockStream.mockReset();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns 500 when aiSlot is missing (defensive guard)', async () => {
    // Build a minimal app that registers aiRoutes with an aiGate that SKIPS
    // aiRateLimit, so request.aiSlot is never attached — exercising the
    // defensive `if (!slot)` branch in the handler.
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
    await minimal.register(aiRoutes, { prefix: '/api/ai' });
    await minimal.ready();

    const token = minimal.jwt.sign({
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'U1',
    });
    const res = await minimal.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${token}` },
      payload: { before: '', after: '', language: 'javascript' },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload)).toEqual({ error: 'internal_error' });
    await minimal.close();
  });

  it('requires authentication (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      payload: { before: '', after: '', language: 'javascript' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed body (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: 123, after: '', language: 'javascript' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('streams token events and ends with done', async () => {
    mockStream.mockImplementation(() => streamOf(['hello ', 'world']));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: 'x', after: 'y', language: 'javascript' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.payload).toContain('event: token\ndata: {"text":"hello "}');
    expect(res.payload).toContain('event: token\ndata: {"text":"world"}');
    expect(res.payload).toContain('event: done\ndata: {}');
  });

  it('emits error event on model failure', async () => {
    mockStream.mockImplementation(() => streamWithError());
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: '', after: '', language: 'javascript' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('model exploded');
  });

  it('falls back to stream_error message when non-Error is thrown', async () => {
    // Cover the `err instanceof Error ? ... : 'stream_error'` fallback branch.
    mockStream.mockImplementation(() => {
      return (async function* () {
        yield 'x';
        // Throwing a string (not an Error) forces the fallback branch.
        throw 'something weird';
      })();
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: '', after: '', language: 'javascript' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('stream_error');
  });

  it('returns 429 for concurrent second request', async () => {
    // First request: never-ending stream (we resolve it via AbortController simulation)
    mockStream.mockImplementationOnce(async function* () {
      yield 'slow';
      await new Promise((r) => setTimeout(r, 1000)); // keep slot held
    });

    const first = app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: '', after: '', language: 'javascript' },
    });
    // Small delay to let the first request enter its handler and acquire the slot
    await new Promise((r) => setImmediate(r));

    const second = await app.inject({
      method: 'POST',
      url: '/api/ai/complete',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { before: '', after: '', language: 'javascript' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBe('5');

    // Cleanup: let the first resolve
    await first;
  });
});

describe('POST /api/ai/generate', () => {
  let app: FastifyInstance;
  let authToken: string;

  beforeEach(async () => {
    app = await buildApp();
    await app.ready();
    authToken = app.jwt.sign({ id: 'u1', email: 'u1@example.com', displayName: 'U1' });
    mockGenerateStream.mockReset();
    mockCreateGenerateChain.mockReset();
    mockCreateGenerateChain.mockReturnValue({ stream: vi.fn() });
  });

  afterEach(async () => {
    await app.close();
  });

  it('streams token events and ends with done on valid body', async () => {
    mockGenerateStream.mockImplementation(() => generateStreamOf(['def fib(n):', '\n  return n']));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'a fibonacci function', contentType: 'snippet', language: 'python' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    expect(res.payload).toContain('event: token\ndata: {"text":"def fib(n):"}');
    expect(res.payload).toContain('event: token\ndata: {"text":"\\n  return n"}');
    expect(res.payload).toContain('event: done\ndata: {}');
  });

  it('rejects body missing contentType (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'something', language: 'python' },
    });
    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('rejects description longer than 2000 chars (400)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'x'.repeat(2001), contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('requires authentication (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      payload: { description: 'something', contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 429 when rate limiter rejects', async () => {
    mockGenerateStream.mockImplementationOnce(async function* () {
      yield 'slow';
      await new Promise((r) => setTimeout(r, 1000));
    });

    const first = app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'a function', contentType: 'snippet' },
    });
    await new Promise((r) => setImmediate(r));

    const second = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'another function', contentType: 'snippet' },
    });
    expect(second.statusCode).toBe(429);
    expect(second.headers['retry-after']).toBe('5');

    await first;
  });

  it('emits error event when the chain throws mid-stream', async () => {
    mockGenerateStream.mockImplementation(() => generateStreamWithError());
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'a function', contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('generate chain exploded');
  });

  it('threads AbortSignal from request.aiSlot.controller to streamGenerate', async () => {
    mockGenerateStream.mockImplementation(() => generateStreamOf(['ok']));
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'a function', contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(200);
    // streamGenerate is called with (chain, parsedData, { signal })
    expect(mockGenerateStream).toHaveBeenCalledTimes(1);
    const callArgs = mockGenerateStream.mock.calls[0] as unknown[];
    const opts = callArgs[2] as { signal?: AbortSignal } | undefined;
    expect(opts?.signal).toBeInstanceOf(AbortSignal);
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
    await minimal.register(aiRoutes, { prefix: '/api/ai' });
    await minimal.ready();

    const token = minimal.jwt.sign({
      id: 'u1',
      email: 'u1@example.com',
      displayName: 'U1',
    });
    const res = await minimal.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${token}` },
      payload: { description: 'a function', contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.payload)).toEqual({ error: 'internal_error' });
    await minimal.close();
  });

  it('falls back to stream_error message when non-Error is thrown', async () => {
    mockGenerateStream.mockImplementation(() => {
      return (async function* () {
        yield 'x';
        throw 'something weird';
      })();
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/ai/generate',
      headers: { authorization: `Bearer ${authToken}` },
      payload: { description: 'a function', contentType: 'snippet' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toContain('event: error');
    expect(res.payload).toContain('stream_error');
  });
});
