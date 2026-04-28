import { describe, it, expect, vi } from 'vitest';
import { neutralizeBrowserApis } from '../../../../lib/sandbox/workers/neutralize-apis.js';

const APIS_TO_NEUTRALIZE = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'indexedDB',
  'caches',
  'EventSource',
] as const;

describe('neutralizeBrowserApis', () => {
  describe('deletes each dangerous browser API', () => {
    for (const api of APIS_TO_NEUTRALIZE) {
      it(`deletes ${api} from scope`, () => {
        const scope: Record<string, unknown> = { [api]: vi.fn() };
        neutralizeBrowserApis(scope);
        expect(scope[api]).toBeUndefined();
        expect(api in scope).toBe(false);
      });
    }
  });

  it('deletes all dangerous APIs when all are present', () => {
    const scope: Record<string, unknown> = {};
    for (const api of APIS_TO_NEUTRALIZE) {
      scope[api] = vi.fn();
    }
    neutralizeBrowserApis(scope);
    for (const api of APIS_TO_NEUTRALIZE) {
      expect(scope[api]).toBeUndefined();
      expect(api in scope).toBe(false);
    }
  });

  it('preserves postMessage', () => {
    const postMessageFn = vi.fn();
    const scope: Record<string, unknown> = {
      fetch: vi.fn(),
      postMessage: postMessageFn,
    };
    neutralizeBrowserApis(scope);
    expect(scope['postMessage']).toBe(postMessageFn);
  });

  it('does not throw when scope is empty', () => {
    const scope: Record<string, unknown> = {};
    expect(() => neutralizeBrowserApis(scope)).not.toThrow();
  });

  it('does not throw when properties are already missing', () => {
    const scope: Record<string, unknown> = { fetch: vi.fn() };
    // Only fetch is present; the rest are missing
    expect(() => neutralizeBrowserApis(scope)).not.toThrow();
    expect(scope['fetch']).toBeUndefined();
  });
});
