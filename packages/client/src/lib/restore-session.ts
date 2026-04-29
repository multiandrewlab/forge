import type { User } from '@forge/shared';
import { useAuthStore } from '@/stores/auth';

/**
 * Boot-time session restore. The browser auto-attaches the HttpOnly
 * `refresh_token` cookie scoped to /api/auth/refresh; if the cookie is valid
 * we get a fresh access token and populate the Pinia auth store before the
 * router guard runs.
 *
 * Best-effort: any failure (no cookie, expired cookie, server down) leaves
 * the store empty and the user lands on /login like a fresh visitor.
 */
export async function tryRestoreSession(): Promise<void> {
  let accessToken: string;
  try {
    const refreshRes = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshRes.ok) return;
    const data = (await refreshRes.json()) as { accessToken: string };
    accessToken = data.accessToken;
  } catch {
    return;
  }

  let user: User;
  try {
    const meRes = await fetch('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
      credentials: 'include',
    });
    if (!meRes.ok) return;
    user = (await meRes.json()) as User;
  } catch {
    return;
  }

  useAuthStore().setAuth(accessToken, user);
}
