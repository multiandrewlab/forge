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
vi.mock('../../plugins/langchain/provider.js', () => ({
  createChatModel: vi.fn().mockReturnValue({} as never),
}));

import { buildApp } from '../../app.js';
import { createAbortHandlers } from '../../routes/ai.js';
import { EventEmitter } from 'node:events';
import type { FastifyInstance, FastifyRequest } from 'fastify';

async function* streamOf(chunks: string[]) {
  for (const c of chunks) yield c;
}

async function* streamWithError() {
  yield 'a';
  throw new Error('model exploded');
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
