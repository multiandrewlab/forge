import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import type { UserProfileResponse } from '@forge/shared';

export function useUserProfile() {
  const profile = ref<UserProfileResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  /** User ID from the most recent fetchProfile call — needed by loadMore. */
  let currentUserId: string | null = null;

  async function fetchProfile(userId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    currentUserId = userId;
    try {
      const response = await apiFetch(`/api/users/${userId}?limit=20`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load profile';
        profile.value = null;
        return;
      }
      const data = (await response.json()) as UserProfileResponse;
      profile.value = data;
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!profile.value?.cursor || !currentUserId) return;

    error.value = null;
    loading.value = true;
    try {
      const url = `/api/users/${currentUserId}?limit=20&cursor=${encodeURIComponent(profile.value.cursor)}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load more posts';
        return;
      }
      const data = (await response.json()) as UserProfileResponse;
      // Append posts and update cursor; keep user/stats/badges from initial fetch
      profile.value = {
        ...profile.value,
        posts: [...profile.value.posts, ...data.posts],
        cursor: data.cursor,
      };
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  return {
    profile,
    loading,
    error,
    fetchProfile,
    loadMore,
  };
}
