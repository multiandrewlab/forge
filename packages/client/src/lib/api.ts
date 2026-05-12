import { useAuthStore } from '@/stores/auth';
import { useToastStore } from '@/stores/toast';
import { useWebSocket } from '@/composables/useWebSocket';

type RefreshResult = { ok: boolean; response: Response | null };

let refreshPromise: Promise<RefreshResult> | null = null;

function maybePushServerError(response: Response): void {
  if (response.status >= 500) {
    const toastStore = useToastStore();
    toastStore.push({ kind: 'error', message: 'Something went wrong. Please try again.' });
  }
}

async function attemptRefresh(): Promise<RefreshResult> {
  const store = useAuthStore();

  try {
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (!response.ok) {
      store.clearAuth();
      return { ok: false, response };
    }

    const data = (await response.json()) as { accessToken: string };
    store.$patch({ accessToken: data.accessToken });
    return { ok: true, response };
  } catch {
    store.clearAuth();
    return { ok: false, response: null };
  }
}

function getOrCreateRefreshPromise(): Promise<RefreshResult> {
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
    maybePushServerError(response);
    return response;
  }

  // Attempt token refresh (deduplicate concurrent refresh calls)
  const refresh = await getOrCreateRefreshPromise();

  if (!refresh.ok) {
    // Surface a 5xx that occurred during the refresh itself (e.g., DB outage,
    // JWT secret missing). The original 401 alone never trips the 5xx toast,
    // so without this the refresh failure is silent. The original response is
    // still returned to the caller so 401-handling routes the user to login.
    maybePushServerError(refresh.response ?? response);
    return response;
  }

  // Retry original request with new token
  const retryHeaders = new Headers(options.headers);
  retryHeaders.set('Authorization', `Bearer ${store.accessToken}`);

  const retryResponse = await fetch(url, {
    ...options,
    headers: retryHeaders,
  });
  maybePushServerError(retryResponse);
  return retryResponse;
}
