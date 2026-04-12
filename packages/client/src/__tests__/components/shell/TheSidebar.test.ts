import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TheSidebar from '../../../components/shell/TheSidebar.vue';

vi.mock('../../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: { value: { id: 'u1', displayName: 'Test User', avatarUrl: null } },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/trending', component: { template: '<div />' } },
      { path: '/my-snippets', component: { template: '<div />' } },
      { path: '/bookmarks', component: { template: '<div />' } },
      { path: '/posts/new', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  });
}

describe('TheSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders all nav links', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Home');
    expect(wrapper.text()).toContain('Trending');
    expect(wrapper.text()).toContain('My Snippets');
    expect(wrapper.text()).toContain('Bookmarks');
  });

  it('renders Create New Post button', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Create New Post');
  });

  it('hides labels when collapsed', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: true, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).not.toContain('Home');
    expect(wrapper.text()).not.toContain('Trending');
    expect(wrapper.text()).not.toContain('My Snippets');
    expect(wrapper.text()).not.toContain('Bookmarks');
  });

  it('nav links have correct routes', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    const links = wrapper.findAll('a');
    const hrefs = links.map((l) => l.attributes('href'));
    expect(hrefs).toContain('/');
    expect(hrefs).toContain('/trending');
    expect(hrefs).toContain('/my-snippets');
    expect(hrefs).toContain('/bookmarks');
  });
});
