import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref, type Ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import TheSidebar from '../../../components/shell/TheSidebar.vue';
import type { Tag } from '@forge/shared';

const mockLoadSubscriptions = vi.fn().mockResolvedValue(undefined);
const mockLoadPopularTags = vi.fn().mockResolvedValue(undefined);
const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
const mockSetTag = vi.fn().mockResolvedValue(undefined);

// Mutable refs so individual tests can control their contents
const subscribedTagsRef: Ref<Tag[]> = ref([
  { id: 't1', name: 'typescript', postCount: 5 },
  { id: 't2', name: 'vue', postCount: 3 },
]);
const popularTagsRef: Ref<Tag[]> = ref([
  { id: 'p1', name: 'rust', postCount: 12 },
  { id: 'p2', name: 'python', postCount: 8 },
]);

vi.mock('../../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: { value: { id: 'u1', displayName: 'Test User', avatarUrl: null } },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('../../../composables/useTags.js', () => ({
  useTags: () => ({
    subscribedTags: subscribedTagsRef,
    popularTags: popularTagsRef,
    loadSubscriptions: mockLoadSubscriptions,
    loadPopularTags: mockLoadPopularTags,
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

// TagSubscribeButton uses the auth and tags Pinia stores; provide minimal
// implementations so it renders without exploding inside the sidebar.
vi.mock('../../../stores/auth', () => ({
  useAuthStore: () => ({ isAuthenticated: true }),
}));

vi.mock('../../../stores/tags', () => ({
  useTagsStore: () => ({ subscribedTags: subscribedTagsRef.value }),
}));

vi.mock('../../../composables/useFeed.js', () => ({
  useFeed: () => ({
    setTag: mockSetTag,
    posts: ref([]),
    sort: ref('recent'),
    selectedPostId: ref(null),
    cursor: ref(null),
    tag: ref(null),
    filter: ref(null),
    contentType: ref(null),
    hasMore: ref(false),
    selectedPost: ref(null),
    error: ref(null),
    loading: ref(false),
    loadPosts: vi.fn(),
    loadMore: vi.fn(),
    setSort: vi.fn(),
    setFilter: vi.fn(),
    setContentType: vi.fn(),
    selectPost: vi.fn(),
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
      { path: '/following', name: 'home-following', component: { template: '<div />' } },
      { path: '/tags/:name', name: 'tag-view', component: { template: '<div />' } },
      { path: '/posts/new', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  });
}

describe('TheSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockLoadSubscriptions.mockClear();
    mockLoadPopularTags.mockClear();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    mockSetTag.mockClear();
    subscribedTagsRef.value = [
      { id: 't1', name: 'typescript', postCount: 5 },
      { id: 't2', name: 'vue', postCount: 3 },
    ];
    popularTagsRef.value = [
      { id: 'p1', name: 'rust', postCount: 12 },
      { id: 'p2', name: 'python', postCount: 8 },
    ];
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

  it('calls loadSubscriptions on mount', () => {
    const router = createTestRouter();
    mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(mockLoadSubscriptions).toHaveBeenCalledOnce();
  });

  it('renders subscribed tags in desktop sidebar', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('#typescript');
    expect(wrapper.text()).toContain('#vue');
  });

  it('hides tags section when collapsed', () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: true, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).not.toContain('#typescript');
    expect(wrapper.text()).not.toContain('#vue');
    expect(wrapper.text()).not.toContain('Followed Tags');
  });

  it('renders subscribed tags in mobile overlay', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay?.textContent).toContain('#typescript');
    expect(overlay?.textContent).toContain('#vue');
    wrapper.unmount();
  });

  it('calls setTag when a tag button is clicked in desktop sidebar', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });

    const tagButtons = wrapper.findAll('button').filter((b) => b.text().includes('#'));
    expect(tagButtons.length).toBeGreaterThanOrEqual(2);
    await tagButtons[0].trigger('click');
    expect(mockSetTag).toHaveBeenCalledWith('typescript');
  });

  it('calls setTag when a tag button is clicked in mobile overlay', async () => {
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    const overlayButtons = document.body.querySelectorAll('.fixed.inset-0 button');
    const tagButton = Array.from(overlayButtons).find((el) =>
      el.textContent?.includes('#typescript'),
    ) as HTMLElement | undefined;
    expect(tagButton).toBeDefined();
    tagButton?.click();
    await wrapper.vm.$nextTick();
    expect(mockSetTag).toHaveBeenCalledWith('typescript');
    wrapper.unmount();
  });

  it('shows empty state when no subscribed tags', () => {
    subscribedTagsRef.value = [];
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('No followed tags');
  });

  it('shows empty state in mobile overlay when no subscribed tags', async () => {
    subscribedTagsRef.value = [];
    const router = createTestRouter();
    const wrapper = mount(TheSidebar, {
      props: { collapsed: false, overlayOpen: true },
      global: { plugins: [router] },
      attachTo: document.body,
    });

    const overlay = document.body.querySelector('.fixed.inset-0');
    expect(overlay?.textContent).toContain('No followed tags');
    wrapper.unmount();
  });

  // ── Following nav link (issue #49) ─────────────────────────────────
  describe('Following nav link', () => {
    it('renders a Following nav link with data-testid="following-nav-link"', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const link = wrapper.find('[data-testid="following-nav-link"]');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe('/following');
      expect(link.text()).toContain('Following');
    });

    it('also renders the Following nav link in the mobile overlay', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: true },
        global: { plugins: [router] },
        attachTo: document.body,
      });

      const overlayLinks = document.body.querySelectorAll(
        '.fixed.inset-0 [data-testid="following-nav-link"]',
      );
      expect(overlayLinks.length).toBeGreaterThanOrEqual(1);
      wrapper.unmount();
    });
  });

  // ── Popular tags section (issue #49) ───────────────────────────────
  describe('Popular Tags section', () => {
    it('calls loadPopularTags(10) on mount', () => {
      const router = createTestRouter();
      mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });
      expect(mockLoadPopularTags).toHaveBeenCalledOnce();
      expect(mockLoadPopularTags).toHaveBeenCalledWith(10);
    });

    it('renders popular-tags-list when popularTags has entries', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const list = wrapper.find('[data-testid="popular-tags-list"]');
      expect(list.exists()).toBe(true);
      expect(wrapper.find('[data-testid="popular-tag-row-rust"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="popular-tag-row-python"]').exists()).toBe(true);
    });

    it('renders RouterLink per popular tag pointing to /tags/:name', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const row = wrapper.find('[data-testid="popular-tag-row-rust"]');
      const tagLink = row.find('a');
      expect(tagLink.exists()).toBe(true);
      expect(tagLink.attributes('href')).toBe('/tags/rust');
    });

    it('renders TagSubscribeButton per row with subscribe-btn-<name> testid', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      expect(wrapper.find('[data-testid="subscribe-btn-rust"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="subscribe-btn-python"]').exists()).toBe(true);
    });

    it('calls subscribe with the tag when TagSubscribeButton emits subscribe', async () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const btn = wrapper.find('[data-testid="subscribe-btn-rust"]');
      await btn.trigger('click');
      // Pending state cleared on resolve
      expect(mockSubscribe).toHaveBeenCalledWith({ id: 'p1', name: 'rust', postCount: 12 });
    });

    it('shows empty-state copy when popularTags is empty', () => {
      popularTagsRef.value = [];
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      expect(wrapper.text()).toContain('No popular tags');
    });

    it('hides Popular Tags section when collapsed', () => {
      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: true, overlayOpen: false },
        global: { plugins: [router] },
      });

      expect(wrapper.find('[data-testid="popular-tags-list"]').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Popular Tags');
    });
  });

  // ── handleSubscribe / handleUnsubscribe path coverage ─────────────
  describe('subscribe/unsubscribe handlers', () => {
    it('handleUnsubscribe calls store unsubscribe with tag id', async () => {
      // Simulate the user already subscribed to "rust" — TagSubscribeButton
      // toggles between subscribe/unsubscribe based on subscribedTags
      // membership.
      subscribedTagsRef.value = [
        { id: 'p1', name: 'rust', postCount: 12 },
        { id: 't1', name: 'typescript', postCount: 5 },
      ];

      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const btn = wrapper.find('[data-testid="subscribe-btn-rust"]');
      expect(btn.attributes('aria-pressed')).toBe('true');
      await btn.trigger('click');

      expect(mockUnsubscribe).toHaveBeenCalledWith('p1');
    });

    it('handleSubscribe sets and clears pending state', async () => {
      // Make subscribe pause so we can observe pendingTagId mid-flight.
      let resolve!: () => void;
      mockSubscribe.mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolve = r;
          }),
      );

      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const btn = wrapper.find('[data-testid="subscribe-btn-rust"]');
      await btn.trigger('click');

      // While pending, the button receives loading=true so it's disabled
      // and aria-busy is set by TagSubscribeButton.
      expect(btn.attributes('aria-busy')).toBe('true');

      resolve();
      await new Promise((r) => setTimeout(r, 0));
      await wrapper.vm.$nextTick();

      // After resolve, no longer busy
      expect(wrapper.find('[data-testid="subscribe-btn-rust"]').attributes('aria-busy')).toBe(
        undefined,
      );
    });

    it('handleUnsubscribe sets and clears pending state', async () => {
      subscribedTagsRef.value = [{ id: 'p1', name: 'rust', postCount: 12 }];

      let resolve!: () => void;
      mockUnsubscribe.mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            resolve = r;
          }),
      );

      const router = createTestRouter();
      const wrapper = mount(TheSidebar, {
        props: { collapsed: false, overlayOpen: false },
        global: { plugins: [router] },
      });

      const btn = wrapper.find('[data-testid="subscribe-btn-rust"]');
      await btn.trigger('click');

      expect(btn.attributes('aria-busy')).toBe('true');

      resolve();
      await new Promise((r) => setTimeout(r, 0));
      await wrapper.vm.$nextTick();

      expect(wrapper.find('[data-testid="subscribe-btn-rust"]').attributes('aria-busy')).toBe(
        undefined,
      );
    });
  });
});
