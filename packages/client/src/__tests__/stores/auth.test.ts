import { describe, it, expect, beforeEach } from 'vitest';
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

describe('useAuthStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have null accessToken by default', () => {
      const store = useAuthStore();
      expect(store.accessToken).toBeNull();
    });

    it('should have null user by default', () => {
      const store = useAuthStore();
      expect(store.user).toBeNull();
    });

    it('should not be authenticated by default', () => {
      const store = useAuthStore();
      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe('setAuth', () => {
    it('should set accessToken and user', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);

      expect(store.accessToken).toBe('test-token');
      expect(store.user).toEqual(user);
    });

    it('should make isAuthenticated true when both token and user are set', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);

      expect(store.isAuthenticated).toBe(true);
    });
  });

  describe('clearAuth', () => {
    it('should clear accessToken and user', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);
      store.clearAuth();

      expect(store.accessToken).toBeNull();
      expect(store.user).toBeNull();
    });

    it('should make isAuthenticated false after clearing', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);
      store.clearAuth();

      expect(store.isAuthenticated).toBe(false);
    });
  });

  describe('setUser', () => {
    it('should update the user without changing accessToken', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);

      const updatedUser = createMockUser({ displayName: 'Updated Name' });
      store.setUser(updatedUser);

      expect(store.user).toEqual(updatedUser);
      expect(store.accessToken).toBe('test-token');
    });

    it('should set user to null', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);
      store.setUser(null);

      expect(store.user).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('should be false when only accessToken is set', () => {
      const store = useAuthStore();
      store.$patch({ accessToken: 'test-token' });

      expect(store.isAuthenticated).toBe(false);
    });

    it('should be false when only user is set', () => {
      const store = useAuthStore();
      const user = createMockUser();
      store.$patch({ user });

      expect(store.isAuthenticated).toBe(false);
    });

    it('should be true only when both accessToken and user are non-null', () => {
      const store = useAuthStore();
      const user = createMockUser();

      store.setAuth('test-token', user);

      expect(store.isAuthenticated).toBe(true);
    });
  });
});
