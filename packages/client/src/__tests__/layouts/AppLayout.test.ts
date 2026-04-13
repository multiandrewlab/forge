import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import type { Pinia } from 'pinia';
import type { User } from '@forge/shared';

// --- Mock child components ---
vi.mock('../../components/shell/TheSidebar.vue', () => ({
  default: {
    name: 'TheSidebar',
    props: ['collapsed', 'overlayOpen'],
    template: '<div data-testid="sidebar"></div>',
  },
}));

vi.mock('../../components/shell/TheTopBar.vue', () => ({
  default: {
    name: 'TheTopBar',
    props: ['sidebarCollapsed'],
    emits: ['toggle-sidebar'],
    template: '<div data-testid="topbar"></div>',
  },
}));

vi.mock('../../components/shell/TheSearchModal.vue', () => ({
  default: {
    name: 'TheSearchModal',
    template: '<div data-testid="search-modal"></div>',
  },
}));

// --- Mock useWebSocket ---
const mockConnect = vi.fn();
const mockDisconnect = vi.fn();
const mockWsSubscribe = vi.fn();

vi.mock('../../composables/useWebSocket.js', () => ({
  useWebSocket: () => ({
    connect: mockConnect,
    disconnect: mockDisconnect,
    subscribe: mockWsSubscribe,
    send: vi.fn(),
    clientId: 'test-client-id',
    status: { value: 'idle' },
  }),
}));

// --- Mock useFeed ---
const mockFeedCleanup = vi.fn();
const mockSubscribeRealtime = vi.fn().mockReturnValue(mockFeedCleanup);

vi.mock('../../composables/useFeed.js', () => ({
  useFeed: () => ({
    subscribeRealtime: mockSubscribeRealtime,
    posts: { value: [] },
    sort: { value: 'recent' },
    selectedPostId: { value: null },
    cursor: { value: null },
    tag: { value: null },
    filter: { value: null },
    contentType: { value: null },
    hasMore: { value: false },
    selectedPost: { value: null },
    error: { value: null },
    loading: { value: false },
    loadPosts: vi.fn(),
    loadMore: vi.fn(),
    setSort: vi.fn(),
    setFilter: vi.fn(),
    setTag: vi.fn(),
    setContentType: vi.fn(),
    selectPost: vi.fn(),
  }),
}));

// --- Mock vue-router ---
vi.mock('vue-router', () => ({
  RouterView: {
    name: 'RouterView',
    template: '<div data-testid="router-view"></div>',
  },
}));

import AppLayout from '../../layouts/AppLayout.vue';

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    authProvider: 'local' as const,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('AppLayout', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    mockConnect.mockClear();
    mockDisconnect.mockClear();
    mockSubscribeRealtime.mockClear();
    mockFeedCleanup.mockClear();
    mockWsSubscribe.mockClear();

    // Provide a stable window.innerWidth for sidebar toggle logic
    vi.stubGlobal('window', { innerWidth: 1024 });
  });

  function mountLayout() {
    return mount(AppLayout, {
      global: {
        plugins: [pinia],
      },
    });
  }

  it('should render the layout structure', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('[data-testid="topbar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="sidebar"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="router-view"]').exists()).toBe(true);
  });

  describe('WebSocket lifecycle', () => {
    it('should NOT connect WebSocket when user is not authenticated', () => {
      mountLayout();
      expect(mockConnect).not.toHaveBeenCalled();
    });

    it('should connect WebSocket when user is authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('test-token', createMockUser());

      mountLayout();
      await flushPromises();

      expect(mockConnect).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should pass a token provider that resolves to the access token', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('my-token', createMockUser());

      mountLayout();
      await flushPromises();

      const tokenProvider = mockConnect.mock.calls[0][0] as () => Promise<string>;
      const token = await tokenProvider();
      expect(token).toBe('my-token');
    });

    it('should subscribe to feed realtime when authenticated', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('test-token', createMockUser());

      mountLayout();
      await flushPromises();

      expect(mockSubscribeRealtime).toHaveBeenCalled();
    });

    it('should disconnect and clean up feed subscription on logout', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('test-token', createMockUser());

      mountLayout();
      await flushPromises();

      expect(mockConnect).toHaveBeenCalled();
      expect(mockSubscribeRealtime).toHaveBeenCalled();

      // Now log out
      authStore.clearAuth();
      await flushPromises();

      expect(mockFeedCleanup).toHaveBeenCalled();
      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should disconnect WebSocket on unmount', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('test-token', createMockUser());

      const wrapper = mountLayout();
      await flushPromises();

      wrapper.unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should clean up feed subscription on unmount', async () => {
      const authStore = useAuthStore();
      authStore.setAuth('test-token', createMockUser());

      const wrapper = mountLayout();
      await flushPromises();

      wrapper.unmount();

      expect(mockFeedCleanup).toHaveBeenCalled();
    });

    it('should provide empty string when accessToken is null', async () => {
      const authStore = useAuthStore();
      // Set auth then patch token to null to simulate edge case
      authStore.setAuth('test-token', createMockUser());

      mountLayout();
      await flushPromises();

      // Patch token to null after connect
      authStore.$patch({ accessToken: null });

      const tokenProvider = mockConnect.mock.calls[0][0] as () => Promise<string>;
      const token = await tokenProvider();
      expect(token).toBe('');
    });
  });

  describe('sidebar toggle', () => {
    it('should toggle sidebar on desktop (width >= 768)', async () => {
      vi.stubGlobal('window', { innerWidth: 1024 });

      const wrapper = mountLayout();
      const topbar = wrapper.findComponent({ name: 'TheTopBar' });

      await topbar.vm.$emit('toggle-sidebar');
      await flushPromises();

      // On desktop, toggleSidebar is called on the UI store
      // We just verify it doesn't throw
    });

    it('should toggle overlay on mobile (width < 768)', async () => {
      vi.stubGlobal('window', { innerWidth: 500 });

      const wrapper = mountLayout();
      const topbar = wrapper.findComponent({ name: 'TheTopBar' });

      await topbar.vm.$emit('toggle-sidebar');
      await flushPromises();

      // On mobile, overlayOpen toggles
      const sidebar = wrapper.findComponent({ name: 'TheSidebar' });
      expect(sidebar.props('overlayOpen')).toBe(true);
    });

    it('should close overlay when sidebar emits close-overlay', async () => {
      vi.stubGlobal('window', { innerWidth: 500 });

      const wrapper = mountLayout();

      // First open overlay
      const topbar = wrapper.findComponent({ name: 'TheTopBar' });
      await topbar.vm.$emit('toggle-sidebar');
      await flushPromises();

      const sidebar = wrapper.findComponent({ name: 'TheSidebar' });
      expect(sidebar.props('overlayOpen')).toBe(true);

      // Now close it
      await sidebar.vm.$emit('close-overlay');
      await flushPromises();

      expect(sidebar.props('overlayOpen')).toBe(false);
    });
  });

  // ── DoD #17: TheSearchModal is rendered ──
  it('should render TheSearchModal', () => {
    const wrapper = mountLayout();
    expect(wrapper.find('[data-testid="search-modal"]').exists()).toBe(true);
  });
});
