import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '@/stores/auth';
import { AuthProvider } from '@forge/shared';
import type { User } from '@forge/shared';
import type { Pinia } from 'pinia';

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

import router from '@/plugins/router';

describe('Router', () => {
  let pinia: Pinia;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    // Reset router to a known state by navigating to a neutral route first
    // Push to a guest route (login) which is always accessible for unauthenticated user
    router.push('/login');
    await router.isReady();
  });

  describe('route definitions', () => {
    it('should have a home route at "/"', () => {
      const route = router.resolve('/');
      expect(route.name).toBe('home');
    });

    it('should have a login route at "/login"', () => {
      const route = router.resolve('/login');
      expect(route.name).toBe('login');
    });

    it('should have a register route at "/register"', () => {
      const route = router.resolve('/register');
      expect(route.name).toBe('register');
    });

    it('should have an auth callback route at "/auth/callback"', () => {
      const route = router.resolve('/auth/callback');
      expect(route.name).toBe('auth-callback');
    });

    it('should have an auth link route at "/auth/link"', () => {
      const route = router.resolve('/auth/link');
      expect(route.name).toBe('auth-link');
    });

    it('should mark home route as requiresAuth', () => {
      const route = router.resolve('/');
      expect(route.meta.requiresAuth).toBe(true);
    });

    it('should mark login route as guest', () => {
      const route = router.resolve('/login');
      expect(route.meta.guest).toBe(true);
    });

    it('should mark register route as guest', () => {
      const route = router.resolve('/register');
      expect(route.meta.guest).toBe(true);
    });

    it('should mark auth callback route as guest', () => {
      const route = router.resolve('/auth/callback');
      expect(route.meta.guest).toBe(true);
    });

    it('should mark auth link route as guest', () => {
      const route = router.resolve('/auth/link');
      expect(route.meta.guest).toBe(true);
    });
  });

  describe('navigation guards', () => {
    it('should redirect unauthenticated user from protected route to /login', async () => {
      await router.push('/');

      expect(router.currentRoute.value.name).toBe('login');
    });

    it('should include redirect query param when redirecting to login', async () => {
      await router.push('/');

      expect(router.currentRoute.value.query.redirect).toBe('/');
    });

    it('should allow authenticated user to access protected route', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/');

      expect(router.currentRoute.value.name).toBe('home');
    });

    it('should redirect authenticated user from guest route to home', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/login');

      expect(router.currentRoute.value.name).toBe('home');
    });

    it('should allow unauthenticated user to access guest route', async () => {
      await router.push('/login');

      expect(router.currentRoute.value.name).toBe('login');
    });

    it('should allow unauthenticated user to access register route', async () => {
      await router.push('/register');

      expect(router.currentRoute.value.name).toBe('register');
    });

    it('should allow unauthenticated user to access auth callback route', async () => {
      await router.push('/auth/callback');

      expect(router.currentRoute.value.name).toBe('auth-callback');
    });

    it('should allow unauthenticated user to access auth link route', async () => {
      await router.push('/auth/link');

      expect(router.currentRoute.value.name).toBe('auth-link');
    });
  });
});
