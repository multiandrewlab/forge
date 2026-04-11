import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import HomePage from '@/pages/HomePage.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomePage,
      meta: { requiresAuth: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guest: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('@/pages/RegisterPage.vue'),
      meta: { guest: true },
    },
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
