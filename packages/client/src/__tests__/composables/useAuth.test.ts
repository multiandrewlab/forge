import { describe, it, expect, beforeEach, vi } from 'vitest';
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

/** Returns the user as it would appear after JSON round-trip (dates become strings). */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Mock the apiFetch module
const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

// Import composable after mock setup
import { useAuth } from '@/composables/useAuth';

describe('useAuth', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  describe('reactive state', () => {
    it('should expose user from store', () => {
      const { user } = useAuth();
      expect(user.value).toBeNull();

      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      expect(user.value).toEqual(createMockUser());
    });

    it('should expose isAuthenticated from store', () => {
      const { isAuthenticated } = useAuth();
      expect(isAuthenticated.value).toBe(false);

      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      expect(isAuthenticated.value).toBe(true);
    });

    it('should expose error as a reactive ref initialized to null', () => {
      const { error } = useAuth();
      expect(error.value).toBeNull();
    });
  });

  describe('login', () => {
    it('should POST to /api/auth/login and store auth data', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: mockUser, accessToken: 'login-token' }), {
          status: 200,
        }),
      );

      const { login } = useAuth();
      await login('test@example.com', 'password123');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
      });

      const store = useAuthStore();
      expect(store.accessToken).toBe('login-token');
      expect(store.user).toEqual(jsonRoundTrip(mockUser));
    });

    it('should set error on login failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
      );

      const { login, error } = useAuth();
      await login('test@example.com', 'wrongpassword');

      expect(error.value).toBe('Invalid credentials');

      const store = useAuthStore();
      expect(store.accessToken).toBeNull();
    });

    it('should set generic error message when server returns non-JSON body', async () => {
      mockApiFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const { login, error } = useAuth();
      await login('test@example.com', 'wrongpassword');

      expect(error.value).toBe('Login failed');
    });

    it('should set generic error message when server returns JSON without error field', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ message: 'bad request' }), { status: 400 }),
      );

      const { login, error } = useAuth();
      await login('test@example.com', 'wrongpassword');

      expect(error.value).toBe('Login failed');
    });

    it('should clear previous error on successful login', async () => {
      const mockUser = createMockUser();

      // First: failed login
      mockApiFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 }),
      );

      const { login, error } = useAuth();
      await login('test@example.com', 'wrong');
      expect(error.value).toBe('Invalid credentials');

      // Second: successful login
      mockApiFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ user: mockUser, accessToken: 'token' }), { status: 200 }),
      );

      await login('test@example.com', 'correct');
      expect(error.value).toBeNull();
    });
  });

  describe('register', () => {
    it('should POST to /api/auth/register and store auth data', async () => {
      const mockUser = createMockUser();
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ user: mockUser, accessToken: 'register-token' }), {
          status: 201,
        }),
      );

      const registerData = {
        email: 'new@example.com',
        display_name: 'New User',
        password: 'password123',
        confirm_password: 'password123',
      };

      const { register } = useAuth();
      await register(registerData);

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(registerData),
      });

      const store = useAuthStore();
      expect(store.accessToken).toBe('register-token');
      expect(store.user).toEqual(jsonRoundTrip(mockUser));
    });

    it('should set error on register failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Email already exists' }), { status: 409 }),
      );

      const { register, error } = useAuth();
      await register({
        email: 'existing@example.com',
        display_name: 'Existing',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(error.value).toBe('Email already exists');
    });

    it('should set generic error message when server returns no error field', async () => {
      mockApiFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const { register, error } = useAuth();
      await register({
        email: 'new@example.com',
        display_name: 'New User',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(error.value).toBe('Registration failed');
    });
  });

  describe('logout', () => {
    it('should POST to /api/auth/logout and clear store', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      mockApiFetch.mockResolvedValue(new Response('', { status: 200 }));

      const { logout } = useAuth();
      await logout();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });

      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
    });

    it('should clear store even if logout request fails', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { logout } = useAuth();
      await logout();

      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
    });
  });

  describe('refresh', () => {
    it('should POST to /api/auth/refresh and update accessToken', async () => {
      const store = useAuthStore();
      store.setAuth('old-token', createMockUser());

      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'refreshed-token' }), { status: 200 }),
      );

      const { refresh } = useAuth();
      await refresh();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
      });

      expect(store.accessToken).toBe('refreshed-token');
    });

    it('should set error on refresh failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Refresh token expired' }), { status: 401 }),
      );

      const { refresh, error } = useAuth();
      await refresh();

      expect(error.value).toBe('Refresh token expired');
    });

    it('should set generic error message when server returns no error field on refresh', async () => {
      mockApiFetch.mockResolvedValue(new Response('Unauthorized', { status: 401 }));

      const { refresh, error } = useAuth();
      await refresh();

      expect(error.value).toBe('Token refresh failed');
    });
  });

  describe('fetchUser', () => {
    it('should GET /api/auth/me and update user in store', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      const updatedUser = createMockUser({ displayName: 'Updated Name' });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(updatedUser), { status: 200 }));

      const { fetchUser } = useAuth();
      await fetchUser();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', {
        credentials: 'include',
      });

      expect(store.user).toEqual(jsonRoundTrip(updatedUser));
    });

    it('should set error on fetchUser failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 }),
      );

      const { fetchUser, error } = useAuth();
      await fetchUser();

      expect(error.value).toBe('Not authenticated');
    });

    it('should set generic error message when server returns no error field on fetchUser', async () => {
      mockApiFetch.mockResolvedValue(new Response('Error', { status: 500 }));

      const { fetchUser, error } = useAuth();
      await fetchUser();

      expect(error.value).toBe('Failed to fetch user');
    });
  });

  describe('updateProfile', () => {
    it('should PATCH /api/auth/me and update user in store', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      const updatedUser = createMockUser({ displayName: 'New Name' });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(updatedUser), { status: 200 }));

      const profileData = { display_name: 'New Name' };

      const { updateProfile } = useAuth();
      await updateProfile(profileData);

      expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(profileData),
      });

      expect(store.user).toEqual(jsonRoundTrip(updatedUser));
    });

    it('should set error on updateProfile failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Validation error' }), { status: 400 }),
      );

      const { updateProfile, error } = useAuth();
      await updateProfile({ display_name: '' });

      expect(error.value).toBe('Validation error');
    });

    it('should set generic error message when server returns no error field on updateProfile', async () => {
      mockApiFetch.mockResolvedValue(new Response('Error', { status: 500 }));

      const { updateProfile, error } = useAuth();
      await updateProfile({ display_name: 'New Name' });

      expect(error.value).toBe('Profile update failed');
    });
  });

  describe('network error handling', () => {
    it('should set error when fetch throws a network error on login', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      const { login, error } = useAuth();
      await login('test@example.com', 'password123');

      expect(error.value).toBe('Network failure');
    });

    it('should set error when fetch throws a network error on register', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      const { register, error } = useAuth();
      await register({
        email: 'new@example.com',
        display_name: 'New User',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(error.value).toBe('Network failure');
    });

    it('should set error when fetch throws a network error on refresh', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      const { refresh, error } = useAuth();
      await refresh();

      expect(error.value).toBe('Network failure');
    });

    it('should set error when fetch throws a network error on fetchUser', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      const { fetchUser, error } = useAuth();
      await fetchUser();

      expect(error.value).toBe('Network failure');
    });

    it('should set error when fetch throws a network error on updateProfile', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));

      const { updateProfile, error } = useAuth();
      await updateProfile({ display_name: 'test' });

      expect(error.value).toBe('Network failure');
    });
  });

  describe('non-Error thrown values', () => {
    it('should use fallback message when login throws a non-Error value', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { login, error } = useAuth();
      await login('test@example.com', 'password123');

      expect(error.value).toBe('Login failed');
    });

    it('should use fallback message when register throws a non-Error value', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { register, error } = useAuth();
      await register({
        email: 'new@example.com',
        display_name: 'New User',
        password: 'password123',
        confirm_password: 'password123',
      });

      expect(error.value).toBe('Registration failed');
    });

    it('should use fallback message when refresh throws a non-Error value', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { refresh, error } = useAuth();
      await refresh();

      expect(error.value).toBe('Token refresh failed');
    });

    it('should use fallback message when fetchUser throws a non-Error value', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { fetchUser, error } = useAuth();
      await fetchUser();

      expect(error.value).toBe('Failed to fetch user');
    });

    it('should use fallback message when updateProfile throws a non-Error value', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { updateProfile, error } = useAuth();
      await updateProfile({ display_name: 'test' });

      expect(error.value).toBe('Profile update failed');
    });
  });
});
