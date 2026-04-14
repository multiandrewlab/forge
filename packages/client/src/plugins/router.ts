import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    // Authenticated routes — all wrapped in AppLayout
    {
      path: '/',
      component: () => import('@/layouts/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'home',
          component: () => import('@/pages/HomePage.vue'),
        },
        {
          path: 'trending',
          name: 'home-trending',
          component: () => import('@/pages/HomePage.vue'),
          props: { sort: 'trending' },
        },
        {
          path: 'my-snippets',
          name: 'home-my-snippets',
          component: () => import('@/pages/HomePage.vue'),
          props: { filter: 'mine' },
        },
        {
          path: 'bookmarks',
          name: 'home-bookmarks',
          component: () => import('@/pages/HomePage.vue'),
          props: { filter: 'bookmarked' },
        },
        {
          path: 'posts/new',
          name: 'post-new',
          component: () => import('@/pages/PostNewPage.vue'),
        },
        {
          path: 'posts/:id',
          name: 'post-view',
          component: () => import('@/pages/PostViewPage.vue'),
        },
        {
          path: 'posts/:id/edit',
          name: 'post-edit',
          component: () => import('@/pages/PostEditPage.vue'),
        },
        {
          path: 'posts/:id/history',
          name: 'post-history',
          component: () => import('@/pages/PostHistoryPage.vue'),
        },
        {
          path: 'playground/:id',
          name: 'playground',
          component: () => import('@/pages/PlaygroundPage.vue'),
        },
        {
          path: 'search',
          name: 'search',
          component: () => import('@/pages/SearchPage.vue'),
          meta: { requiresAuth: false },
        },
      ],
    },
    // Login — wrapped in AuthLayout
    {
      path: '/login',
      component: () => import('@/layouts/AuthLayout.vue'),
      meta: { guest: true },
      children: [
        {
          path: '',
          name: 'login',
          component: () => import('@/pages/LoginPage.vue'),
        },
      ],
    },
    // Register — separate top-level route wrapped in AuthLayout
    {
      path: '/register',
      component: () => import('@/layouts/AuthLayout.vue'),
      meta: { guest: true },
      children: [
        {
          path: '',
          name: 'register',
          component: () => import('@/pages/RegisterPage.vue'),
        },
      ],
    },
    // Auth callback + link — flat standalone routes
    {
      path: '/auth/callback',
      name: 'auth-callback',
      component: () => import('@/pages/AuthCallbackPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/auth/link',
      name: 'auth-link',
      component: () => import('@/pages/AccountLinkPage.vue'),
      meta: { guest: true },
    },
  ],
});

router.beforeEach((to) => {
  const store = useAuthStore();
  if (to.meta.requiresAuth && !store.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guest && store.isAuthenticated) {
    return { name: 'home' };
  }
});

export default router;
