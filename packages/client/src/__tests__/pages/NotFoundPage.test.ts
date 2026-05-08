import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory, RouterLink } from 'vue-router';
import NotFoundPage from '@/pages/NotFoundPage.vue';

describe('NotFoundPage', () => {
  it('renders a 404 page with the standard testid and a back-to-home link', () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>home</div>' } },
        { path: '/404', component: NotFoundPage },
      ],
    });
    const wrapper = mount(NotFoundPage, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    const link = wrapper.findComponent(RouterLink);
    expect(link.exists()).toBe(true);
    expect(link.props('to')).toBe('/');
  });
});
