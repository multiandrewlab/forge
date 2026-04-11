import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import type { User } from '@forge/shared';
import { AuthProvider } from '@forge/shared';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    authProvider: AuthProvider.Local,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// We need to dynamically import apiFetch after setting up pinia each time
// so the store is properly initialized
let apiFetch: typeof import('@/lib/api').apiFetch;

describe('apiFetch', () => {
  let mockFetch: Mock;

  beforeEach(async () => {
    setActivePinia(createPinia());
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    // Reset module state between tests to clear isRefreshing flag
    vi.resetModules();
    const apiModule = await import('@/lib/api');
    apiFetch = apiModule.apiFetch;
  });

  it('should pass through requests when no token is set', async () => {
    const mockResponse = new Response(JSON.stringify({ data: 'test' }), { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    const response = await apiFetch('/api/posts');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/posts');
    expect(options.headers).toBeDefined();
    const headers = new Headers(options.headers);
    expect(headers.has('Authorization')).toBe(false);
    expect(response).toBe(mockResponse);
  });

  it('should add Authorization header when token is set', async () => {
    const store = useAuthStore();
    store.setAuth('my-token', createMockUser());

    const mockResponse = new Response('{}', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    await apiFetch('/api/posts');

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('should merge user-provided headers with auth header', async () => {
    const store = useAuthStore();
    store.setAuth('my-token', createMockUser());

    const mockResponse = new Response('{}', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    await apiFetch('/api/posts', {
      headers: { 'Content-Type': 'application/json' },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(options.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('should preserve user-provided request options', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    mockFetch.mockResolvedValue(mockResponse);

    await apiFetch('/api/posts', { method: 'POST', body: '{"title":"test"}' });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe('POST');
    expect(options.body).toBe('{"title":"test"}');
  });

  describe('401 auto-refresh', () => {
    it('should attempt refresh on 401 and retry original request', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      // First call: 401
      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });
      // Refresh call: success
      const refreshResponse = new Response(JSON.stringify({ accessToken: 'new-token' }), {
        status: 200,
      });
      // Retry call: success
      const successResponse = new Response(JSON.stringify({ data: 'success' }), { status: 200 });

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        .mockResolvedValueOnce(refreshResponse)
        .mockResolvedValueOnce(successResponse);

      const result = await apiFetch('/api/posts');

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Second call should be the refresh
      const [refreshUrl, refreshOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
      expect(refreshUrl).toBe('/api/auth/refresh');
      expect(refreshOptions.method).toBe('POST');
      expect(refreshOptions.credentials).toBe('include');

      // Third call should be the retry with new token
      const [, retryOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
      const retryHeaders = new Headers(retryOptions.headers);
      expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');

      // Store should be updated with new token
      expect(store.accessToken).toBe('new-token');

      expect(result).toBe(successResponse);
    });

    it('should retry without original options when apiFetch was called with no options', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });
      const refreshResponse = new Response(JSON.stringify({ accessToken: 'new-token' }), {
        status: 200,
      });
      const successResponse = new Response('{"data":"ok"}', { status: 200 });

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        .mockResolvedValueOnce(refreshResponse)
        .mockResolvedValueOnce(successResponse);

      // Call apiFetch with only URL and no options
      const result = await apiFetch('/api/posts');

      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Retry call should have auth header even though no options were passed originally
      const [, retryOptions] = mockFetch.mock.calls[2] as [string, RequestInit];
      const retryHeaders = new Headers(retryOptions.headers);
      expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');

      expect(result).toBe(successResponse);
    });

    it('should clear auth when refresh fails', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      // First call: 401
      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });
      // Refresh call: failure
      const refreshFailResponse = new Response('Refresh failed', { status: 401 });

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        .mockResolvedValueOnce(refreshFailResponse);

      const result = await apiFetch('/api/posts');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Store should be cleared
      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();

      // Should return the original 401 response
      expect(result).toBe(unauthorizedResponse);
    });

    it('should clear auth when refresh request throws a network error', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      // First call: 401
      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });

      mockFetch
        .mockResolvedValueOnce(unauthorizedResponse)
        // Refresh call: network error
        .mockRejectedValueOnce(new Error('Network error'));

      const result = await apiFetch('/api/posts');

      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Store should be cleared
      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();

      // Should return the original 401 response
      expect(result).toBe(unauthorizedResponse);
    });

    it('should not attempt refresh on refresh endpoint itself (prevent infinite loop)', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });
      mockFetch.mockResolvedValueOnce(unauthorizedResponse);

      const result = await apiFetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      // Only 1 call - no retry
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toBe(unauthorizedResponse);
    });

    it('should not attempt refresh when no token is set', async () => {
      // No auth set, store is default (no token)
      const unauthorizedResponse = new Response('Unauthorized', { status: 401 });
      mockFetch.mockResolvedValueOnce(unauthorizedResponse);

      const result = await apiFetch('/api/posts');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result).toBe(unauthorizedResponse);
    });

    it('should deduplicate concurrent refresh when multiple requests get 401', async () => {
      const store = useAuthStore();
      store.setAuth('expired-token', createMockUser());

      // Use a deferred promise for the refresh so both requests enter the 401
      // handler before the refresh completes
      let resolveRefresh!: (value: Response) => void;
      const deferredRefresh = new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });

      let callCount = 0;
      mockFetch.mockImplementation((url: string) => {
        callCount++;
        if (callCount <= 2) {
          // First two calls: original requests return 401
          return Promise.resolve(new Response('Unauthorized', { status: 401 }));
        }
        if (url === '/api/auth/refresh') {
          // Refresh call: deferred
          return deferredRefresh;
        }
        // Retry calls: success
        return Promise.resolve(new Response(`{"data":"${callCount}"}`, { status: 200 }));
      });

      // Fire both requests concurrently
      const promise1 = apiFetch('/api/posts/1');
      const promise2 = apiFetch('/api/posts/2');

      // Allow both to reach the 401 handler and start waiting on refresh
      await new Promise((r) => setTimeout(r, 0));

      // Now resolve the refresh
      resolveRefresh(new Response(JSON.stringify({ accessToken: 'new-token' }), { status: 200 }));

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Only one refresh call should have been made
      const refreshCalls = mockFetch.mock.calls.filter(
        (call) => (call as [string, RequestInit | undefined])[0] === '/api/auth/refresh',
      );
      expect(refreshCalls).toHaveLength(1);

      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);
      expect(store.accessToken).toBe('new-token');
    });
  });
});
