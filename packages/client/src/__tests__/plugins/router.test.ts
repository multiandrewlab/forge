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

    it('should have a trending route at "/trending"', () => {
      const route = router.resolve('/trending');
      expect(route.name).toBe('home-trending');
    });

    it('should have a my-snippets route at "/my-snippets"', () => {
      const route = router.resolve('/my-snippets');
      expect(route.name).toBe('home-my-snippets');
    });

    it('should have a bookmarks route at "/bookmarks"', () => {
      const route = router.resolve('/bookmarks');
      expect(route.name).toBe('home-bookmarks');
    });

    it('should have a post-new route at "/posts/new"', () => {
      const route = router.resolve('/posts/new');
      expect(route.name).toBe('post-new');
    });

    it('should have a post-view route at "/posts/:id"', () => {
      const route = router.resolve('/posts/abc');
      expect(route.name).toBe('post-view');
    });

    it('should have a post-edit route at "/posts/:id/edit"', () => {
      const route = router.resolve('/posts/abc/edit');
      expect(route.name).toBe('post-edit');
    });

    it('should have a post-history route at "/posts/:id/history"', () => {
      const route = router.resolve('/posts/abc/history');
      expect(route.name).toBe('post-history');
    });

    it('should have a playground route at "/playground/:id"', () => {
      const route = router.resolve('/playground/abc');
      expect(route.name).toBe('playground');
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

    it('should have a search route at "/search"', () => {
      const route = router.resolve('/search');
      expect(route.name).toBe('search');
    });

    it('should mark search route as not requiring auth', () => {
      const route = router.resolve('/search');
      expect(route.meta.requiresAuth).toBe(false);
    });

    it('should have a home-following route at "/following"', () => {
      const route = router.resolve('/following');
      expect(route.name).toBe('home-following');
    });

    it('should mark home-following route as requiresAuth (inherits from parent)', () => {
      const route = router.resolve('/following');
      expect(route.meta.requiresAuth).toBe(true);
    });

    it('should have a tag-view route at "/tags/:name"', () => {
      const route = router.resolve('/tags/typescript');
      expect(route.name).toBe('tag-view');
    });

    it('should mark tag-view route as not requiring auth', () => {
      const route = router.resolve('/tags/typescript');
      expect(route.meta.requiresAuth).toBe(false);
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

    it('should navigate to trending route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/trending');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('home-trending');
    });

    it('should navigate to my-snippets route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/my-snippets');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('home-my-snippets');
    });

    it('should navigate to bookmarks route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/bookmarks');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('home-bookmarks');
    });

    it('should navigate to home-following route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/following');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('home-following');
    });

    it('should pass filter=subscribed prop to HomePage on /following', () => {
      const route = router.resolve('/following');
      const matched = route.matched[route.matched.length - 1];
      expect(matched.props.default).toEqual({ filter: 'subscribed' });
    });

    it('should navigate to tag-view route when unauthenticated', async () => {
      await router.push('/tags/typescript');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('tag-view');
    });

    it('should expose :name route param on tag-view', async () => {
      await router.push('/tags/javascript');
      await router.isReady();

      expect(router.currentRoute.value.params.name).toBe('javascript');
    });

    it('should navigate to post-history route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/posts/xyz/history');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('post-history');
    });

    it('should navigate to playground route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/playground/abc');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('playground');
    });

    it('should lazy-load PostNewPage component when navigating to post-new', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/posts/new');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('post-new');
    });

    it('should lazy-load PostViewPage component when navigating to post-view', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/posts/abc');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('post-view');
    });

    it('should have a user-profile route at "/user/:id"', () => {
      const route = router.resolve('/user/abc');
      expect(route.name).toBe('user-profile');
    });

    it('should navigate to user-profile route when authenticated', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/user/abc');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('user-profile');
    });

    it('should lazy-load PostEditPage component when navigating to post-edit', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/posts/abc/edit');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('post-edit');
    });

    it('matches /:pathMatch(.*)* to NotFoundPage', () => {
      const route = router.resolve('/this/does/not/exist');
      expect(route.name).toBe('not-found');
    });

    it('should mark not-found route as not requiring auth', () => {
      const route = router.resolve('/this/does/not/exist');
      expect(route.meta.requiresAuth).toBe(false);
    });

    it('should lazy-load NotFoundPage component when navigating to an unknown path', async () => {
      await router.push('/this/does/not/exist');
      await router.isReady();

      expect(router.currentRoute.value.name).toBe('not-found');
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

    it('should allow unauthenticated user to access search route', async () => {
      await router.push('/search');

      expect(router.currentRoute.value.name).toBe('search');
    });

    it('should allow authenticated user to access search route', async () => {
      const store = useAuthStore();
      store.setAuth('token', createMockUser());

      await router.push('/search');

      expect(router.currentRoute.value.name).toBe('search');
    });
  });
});
