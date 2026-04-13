import { useAuthStore } from '@/stores/auth';
import { useWebSocket } from '@/composables/useWebSocket';

let refreshPromise: Promise<boolean> | null = null;

async function attemptRefresh(): Promise<boolean> {
  const store = useAuthStore();

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      store.clearAuth();
      return false;
    }

    const data = (await response.json()) as { accessToken: string };
    store.$patch({ accessToken: data.accessToken });
    return true;
  } catch {
    store.clearAuth();
    return false;
  }
}

function getOrCreateRefreshPromise(): Promise<boolean> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = attemptRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const store = useAuthStore();

  const headers = new Headers(options.headers);

  if (store.accessToken) {
    headers.set('Authorization', `Bearer ${store.accessToken}`);
  }

  // Inject WebSocket client ID on mutating HTTP methods so the server can
  // exclude the originating client from its own broadcast.
  const method = (options.method ?? 'GET').toUpperCase();
  const MUTATING_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE'];
  if (MUTATING_METHODS.includes(method)) {
    const { clientId } = useWebSocket();
    headers.set('x-ws-client-id', clientId);
  }

  const mergedOptions: RequestInit = {
    ...options,
    headers,
  };

  const response = await fetch(url, mergedOptions);

  // Skip refresh logic if: not 401, no token, or this IS the refresh endpoint
  if (response.status !== 401 || !store.accessToken || url === '/api/auth/refresh') {
    return response;
  }

  // Attempt token refresh (deduplicate concurrent refresh calls)
  const refreshed = await getOrCreateRefreshPromise();

  if (!refreshed) {
    return response;
  }

  // Retry original request with new token
  const retryHeaders = new Headers(options.headers);
  retryHeaders.set('Authorization', `Bearer ${store.accessToken}`);

  return fetch(url, {
    ...options,
    headers: retryHeaders,
  });
}
