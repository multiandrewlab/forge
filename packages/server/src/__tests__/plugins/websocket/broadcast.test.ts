import { describe, it, expect } from 'vitest';
import { getExcludeWs } from '../../../plugins/websocket/broadcast.js';
import type { FastifyInstance, FastifyRequest } from 'fastify';

function makeFakeApp(findResult: unknown = undefined) {
  return {
    websocket: {
      connections: {
        findByClientId: (id: string) => (id ? findResult : undefined),
      },
    },
  } as unknown as FastifyInstance;
}

function makeFakeRequest(headers: Record<string, string | string[] | undefined> = {}) {
  return { headers } as unknown as FastifyRequest;
}

describe('getExcludeWs', () => {
  it('returns undefined when x-ws-client-id header is absent', () => {
    const app = makeFakeApp();
    const request = makeFakeRequest({});
    expect(getExcludeWs(app, request)).toBeUndefined();
  });

  it('returns undefined when x-ws-client-id header is an empty string', () => {
    const app = makeFakeApp();
    const request = makeFakeRequest({ 'x-ws-client-id': '' });
    expect(getExcludeWs(app, request)).toBeUndefined();
  });

  it('returns undefined when x-ws-client-id header is an array (non-string)', () => {
    const app = makeFakeApp();
    const request = makeFakeRequest({
      'x-ws-client-id': ['a', 'b'] as unknown as string,
    });
    expect(getExcludeWs(app, request)).toBeUndefined();
  });

  it('returns the socket when findByClientId finds a match', () => {
    const fakeSocket = { readyState: 1, send: () => {} };
    const app = makeFakeApp(fakeSocket);
    const request = makeFakeRequest({ 'x-ws-client-id': 'client-123' });
    expect(getExcludeWs(app, request)).toBe(fakeSocket);
  });

  it('returns undefined when findByClientId returns undefined (no match)', () => {
    const app = makeFakeApp(undefined);
    const request = makeFakeRequest({ 'x-ws-client-id': 'unknown-client' });
    expect(getExcludeWs(app, request)).toBeUndefined();
  });
});
