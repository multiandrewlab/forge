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

  it('renders mobile overlay when overlayOpen is true', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    // The overlay is rendered via Teleport — check in the document body
    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay).not.toBeNull();
    wrapper.unmount();
  });

  it('emits closeOverlay when overlay backdrop is clicked', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    const backdrop = document.body.querySelector('.absolute.inset-0.bg-black\\/50') as HTMLElement;
    expect(backdrop).not.toBeNull();
    backdrop.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('closeOverlay')).toBeTruthy();
    wrapper.unmount();
  });

  it('renders Create New Post link in mobile overlay', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    // The overlay aside contains a "Create New Post" link
    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay?.textContent).toContain('Create New Post');
    wrapper.unmount();
  });

  it('emits closeOverlay when overlay Create New Post link is clicked', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    // The "Create New Post" RouterLink inside the overlay has @click="$emit('closeOverlay')"
    const overlayLinks = document.body.querySelectorAll('.fixed.inset-0 a');
    const createLink = Array.from(overlayLinks).find((el) =>
      el.textContent?.includes('Create New Post'),
    ) as HTMLElement | undefined;
    expect(createLink).toBeDefined();
    createLink?.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('closeOverlay')).toBeTruthy();
    wrapper.unmount();
  });

  it('emits closeOverlay when an overlay nav link is clicked', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    // Nav links inside the overlay have @click="$emit('closeOverlay')"
    const overlayLinks = document.body.querySelectorAll('.fixed.inset-0 nav a');
    const homeLink = Array.from(overlayLinks).find((el) => el.textContent?.trim() === 'Home') as
      | HTMLElement
      | undefined;
    expect(homeLink).toBeDefined();
    homeLink?.click();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted('closeOverlay')).toBeTruthy();
    wrapper.unmount();
  });
});
