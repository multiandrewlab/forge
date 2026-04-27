import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UserProfileResponse } from '@forge/shared';

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

import { useUserProfile } from '../../composables/useUserProfile.js';

const FAKE_USER: UserProfileResponse['user'] = {
  id: 'u1',
  displayName: 'Alice',
  avatarUrl: 'https://example.com/alice.png',
  createdAt: '2024-01-15T00:00:00Z',
};

const FAKE_STATS: UserProfileResponse['stats'] = {
  postCount: 5,
  totalVotes: 42,
  topTags: [{ tagName: 'typescript', voteSum: 10 }],
};

const FAKE_BADGE: UserProfileResponse['badges'][number] = {
  type: 'top_contributor',
  label: '#1 Contributor',
  rank: 1,
};

const FAKE_POST: UserProfileResponse['posts'][number] = {
  id: 'p1',
  title: 'My Post',
  contentType: 'snippet',
  language: 'typescript',
  voteCount: 3,
  createdAt: '2024-06-01T00:00:00Z',
  tags: ['typescript'],
};

const FAKE_PROFILE: UserProfileResponse = {
  user: FAKE_USER,
  stats: FAKE_STATS,
  badges: [FAKE_BADGE],
  posts: [FAKE_POST],
  cursor: null,
};

const FAKE_PROFILE_WITH_CURSOR: UserProfileResponse = {
  ...FAKE_PROFILE,
  cursor: 'next-page-cursor',
};

describe('useUserProfile', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it('returns profile, loading, and error refs plus fetchProfile and loadMore functions', () => {
    const composable = useUserProfile();
    expect(composable).toHaveProperty('profile');
    expect(composable).toHaveProperty('loading');
    expect(composable).toHaveProperty('error');
    expect(composable).toHaveProperty('fetchProfile');
    expect(composable).toHaveProperty('loadMore');
  });

  describe('fetchProfile', () => {
    it('calls apiFetch with correct URL and sets profile on success', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE));

      const { fetchProfile, profile, loading } = useUserProfile();
      const promise = fetchProfile('u1');

      expect(loading.value).toBe(true);

      await promise;

      expect(mockApiFetch).toHaveBeenCalledWith('/api/users/u1?limit=20');
      expect(profile.value).toEqual(FAKE_PROFILE);
      expect(loading.value).toBe(false);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'User not found' }, false));

      const { fetchProfile, profile, error, loading } = useUserProfile();
      await fetchProfile('u1');

      expect(error.value).toBe('User not found');
      expect(profile.value).toBeNull();
      expect(loading.value).toBe(false);
    });

    it('falls back to generic error message when response body has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { fetchProfile, error } = useUserProfile();
      await fetchProfile('u1');

      expect(error.value).toBe('Failed to load profile');
    });

    it('sets error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { fetchProfile, error, loading } = useUserProfile();
      await fetchProfile('u1');

      expect(error.value).toBe('Network error');
      expect(loading.value).toBe(false);
    });

    it('clears previous error on new fetch', async () => {
      mockApiFetch.mockRejectedValueOnce(new Error('Network error'));

      const { fetchProfile, error } = useUserProfile();
      await fetchProfile('u1');
      expect(error.value).toBe('Network error');

      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE));
      await fetchProfile('u1');
      expect(error.value).toBeNull();
    });
  });

  describe('loadMore', () => {
    it('does nothing when profile has no cursor', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE));

      const { fetchProfile, loadMore } = useUserProfile();
      await fetchProfile('u1');
      mockApiFetch.mockClear();

      await loadMore();

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('fetches next page and appends posts when cursor exists', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE_WITH_CURSOR));

      const { fetchProfile, loadMore, profile } = useUserProfile();
      await fetchProfile('u1');

      const nextPost: UserProfileResponse['posts'][number] = {
        id: 'p2',
        title: 'Second Post',
        contentType: 'snippet',
        language: 'python',
        voteCount: 1,
        createdAt: '2024-07-01T00:00:00Z',
        tags: ['python'],
      };

      const nextPageResponse: UserProfileResponse = {
        ...FAKE_PROFILE,
        posts: [nextPost],
        cursor: null,
      };

      mockApiFetch.mockResolvedValue(mockResponse(nextPageResponse));

      await loadMore();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/users/u1?limit=20&cursor=next-page-cursor');
      // Posts are appended
      expect(profile.value?.posts).toHaveLength(2);
      expect(profile.value?.posts[0]).toEqual(FAKE_POST);
      expect(profile.value?.posts[1]).toEqual(nextPost);
      // Cursor updated
      expect(profile.value?.cursor).toBeNull();
      // User/stats/badges stay from initial fetch
      expect(profile.value?.user).toEqual(FAKE_USER);
      expect(profile.value?.stats).toEqual(FAKE_STATS);
      expect(profile.value?.badges).toEqual([FAKE_BADGE]);
    });

    it('does nothing when profile is null', async () => {
      const { loadMore } = useUserProfile();
      mockApiFetch.mockClear();

      await loadMore();

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('sets error when loadMore response is not ok', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE_WITH_CURSOR));

      const { fetchProfile, loadMore, error } = useUserProfile();
      await fetchProfile('u1');

      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Server error' }, false));

      await loadMore();

      expect(error.value).toBe('Server error');
    });

    it('falls back to generic error when loadMore response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE_WITH_CURSOR));

      const { fetchProfile, loadMore, error } = useUserProfile();
      await fetchProfile('u1');

      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      await loadMore();

      expect(error.value).toBe('Failed to load more posts');
    });

    it('sets error on network failure during loadMore', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_PROFILE_WITH_CURSOR));

      const { fetchProfile, loadMore, error, loading } = useUserProfile();
      await fetchProfile('u1');

      mockApiFetch.mockRejectedValue(new Error('Network error'));

      await loadMore();

      expect(error.value).toBe('Network error');
      expect(loading.value).toBe(false);
    });
  });
});
