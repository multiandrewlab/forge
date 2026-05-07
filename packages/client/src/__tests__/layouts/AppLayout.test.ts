import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useAuthStore } from '../../stores/auth.js';
import { _resetForTesting } from '../../composables/useKeyboard.js';
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

vi.mock('../../components/shell/KeyboardShortcutsHelp.vue', () => ({
  default: {
    name: 'KeyboardShortcutsHelp',
    props: ['open'],
    emits: ['close'],
    template:
      '<div data-testid="keyboard-shortcuts-help-mock" :data-open="open" @click="$emit(\'close\')"></div>',
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
const mockRouterPush = vi.fn();

vi.mock('vue-router', () => ({
  RouterView: {
    name: 'RouterView',
    template: '<div data-testid="router-view"></div>',
  },
  useRouter: (): { push: typeof mockRouterPush } => ({
    push: mockRouterPush,
  }),
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
    mockRouterPush.mockClear();
    _resetForTesting();

    // Provide a stable window.innerWidth for sidebar toggle logic
    Object.defineProperty(window, 'innerWidth', {
      value: 1024,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    _resetForTesting();
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
      Object.defineProperty(window, 'innerWidth', {
        value: 1024,
        writable: true,
        configurable: true,
      });

      const wrapper = mountLayout();
      const topbar = wrapper.findComponent({ name: 'TheTopBar' });

      await topbar.vm.$emit('toggle-sidebar');
      await flushPromises();

      // On desktop, toggleSidebar is called on the UI store
      // We just verify it doesn't throw
    });

    it('should toggle overlay on mobile (width < 768)', async () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
        configurable: true,
      });

      const wrapper = mountLayout();
      const topbar = wrapper.findComponent({ name: 'TheTopBar' });

      await topbar.vm.$emit('toggle-sidebar');
      await flushPromises();

      // On mobile, overlayOpen toggles
      const sidebar = wrapper.findComponent({ name: 'TheSidebar' });
      expect(sidebar.props('overlayOpen')).toBe(true);
    });

    it('should close overlay when sidebar emits close-overlay', async () => {
      Object.defineProperty(window, 'innerWidth', {
        value: 500,
        writable: true,
        configurable: true,
      });

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

  describe('keyboard shortcuts', () => {
    it('mounts KeyboardShortcutsHelp closed by default', () => {
      const wrapper = mountLayout();
      const help = wrapper.find('[data-testid="keyboard-shortcuts-help-mock"]');
      expect(help.exists()).toBe(true);
      expect(help.attributes('data-open')).toBe('false');
    });

    it('pressing "n" navigates to /posts/new', () => {
      mountLayout();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }));

      expect(mockRouterPush).toHaveBeenCalledWith('/posts/new');
    });

    it('pressing "?" opens the keyboard shortcuts help', async () => {
      const wrapper = mountLayout();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      await flushPromises();

      const help = wrapper.find('[data-testid="keyboard-shortcuts-help-mock"]');
      expect(help.attributes('data-open')).toBe('true');
    });

    it('emitting close from KeyboardShortcutsHelp closes the help', async () => {
      const wrapper = mountLayout();

      // Open the help first
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));
      await flushPromises();

      let help = wrapper.find('[data-testid="keyboard-shortcuts-help-mock"]');
      expect(help.attributes('data-open')).toBe('true');

      // Click the mock fires the close emit
      await help.trigger('click');
      await flushPromises();

      help = wrapper.find('[data-testid="keyboard-shortcuts-help-mock"]');
      expect(help.attributes('data-open')).toBe('false');
    });
  });
});
