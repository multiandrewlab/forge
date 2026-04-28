import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { tryRestoreSession } from '../../lib/restore-session';
import { useAuthStore } from '../../stores/auth';

const fetchMock = vi.fn();

beforeEach(() => {
  setActivePinia(createPinia());
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('tryRestoreSession', () => {
  it('populates the auth store when refresh + me both succeed', async () => {
    // Match the actual @forge/shared User shape (camelCase displayName,
    // required avatarUrl/authProvider/timestamps). Verified against
    // packages/shared/src/types/index.ts.
    const mockUser = {
      id: 'u1',
      email: 'u@example.com',
      displayName: 'U',
      avatarUrl: null,
      authProvider: 'local' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'abc' }), { status: 200 }),
        );
      }
      if (url === '/api/auth/me') {
        return Promise.resolve(new Response(JSON.stringify(mockUser), { status: 200 }));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBe('abc');
    expect(store.user).toEqual(mockUser);
  });

  it('leaves the auth store empty when refresh fails', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 401 }));

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('leaves the auth store empty when me fetch fails', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'abc' }), { status: 200 }),
        );
      }
      return Promise.resolve(new Response('', { status: 500 }));
    });

    await tryRestoreSession();

    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });

  it('does not throw if fetch rejects (network error)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(tryRestoreSession()).resolves.toBeUndefined();
    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
  });

  it('does not throw if refresh returns a non-JSON 200 (e.g. proxied HTML error page)', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    await expect(tryRestoreSession()).resolves.toBeUndefined();
    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
  });

  it('does not throw if me fetch rejects after refresh succeeds', async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === '/api/auth/refresh') {
        return Promise.resolve(
          new Response(JSON.stringify({ accessToken: 'abc' }), { status: 200 }),
        );
      }
      return Promise.reject(new Error('me network down'));
    });

    await expect(tryRestoreSession()).resolves.toBeUndefined();
    const store = useAuthStore();
    expect(store.accessToken).toBeNull();
    expect(store.user).toBeNull();
  });
});
