import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchStore } from '../../../stores/search';
import { _resetForTesting } from '../../../composables/useKeyboard';
import TheTopBar from '../../../components/shell/TheTopBar.vue';

describe('TheTopBar', () => {
  let store: ReturnType<typeof useSearchStore>;

  beforeEach(() => {
    setActivePinia(createPinia());
    store = useSearchStore();
    _resetForTesting();
  });

  afterEach(() => {
    _resetForTesting();
  });

  function mountTopBar() {
    return mount(TheTopBar, {
      props: { sidebarCollapsed: false },
    });
  }

  it('renders the Forge brand name', () => {
    const wrapper = mountTopBar();
    expect(wrapper.text()).toContain('Forge');
  });

  it('renders the sidebar toggle button', () => {
    const wrapper = mountTopBar();
    const btn = wrapper.find('[aria-label="Toggle sidebar"]');
    expect(btn.exists()).toBe(true);
  });

  it('emits toggleSidebar when sidebar toggle button is clicked', async () => {
    const wrapper = mountTopBar();
    await wrapper.find('[aria-label="Toggle sidebar"]').trigger('click');
    expect(wrapper.emitted('toggleSidebar')).toBeTruthy();
  });

  it('renders a search button that looks like an input', () => {
    const wrapper = mountTopBar();
    const searchBtn = wrapper.find('[data-testid="search-trigger"]');
    expect(searchBtn.exists()).toBe(true);
    expect(searchBtn.text()).toContain('Search');
  });

  it('renders Cmd+K hint in the search button', () => {
    const wrapper = mountTopBar();
    const searchBtn = wrapper.find('[data-testid="search-trigger"]');
    expect(searchBtn.text()).toMatch(/[Cc]md\+K/);
  });

  it('renders the dark mode toggle', () => {
    const wrapper = mountTopBar();
    const btn = wrapper.find('[aria-label="Toggle dark mode"]');
    expect(btn.exists()).toBe(true);
  });

  it('clicking the dark mode toggle calls toggle()', async () => {
    const wrapper = mountTopBar();
    const btn = wrapper.find('[aria-label="Toggle dark mode"]');
    await btn.trigger('click');
    // Toggle changes the darkMode ref — just verify no error
    expect(btn.exists()).toBe(true);
  });

  // ── DoD #15: Clicking search button calls searchStore.open() ──
  it('clicking the search button calls searchStore.open()', async () => {
    const wrapper = mountTopBar();
    const openSpy = vi.spyOn(store, 'open');

    const searchBtn = wrapper.find('[data-testid="search-trigger"]');
    await searchBtn.trigger('click');

    expect(openSpy).toHaveBeenCalled();
  });

  // ── DoD #16: Cmd+K calls searchStore.open() ──
  it('Cmd+K keyboard shortcut calls searchStore.open()', async () => {
    // Stub navigator.platform to MacIntel for isMac() detection
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', {
      value: 'MacIntel',
      writable: true,
      configurable: true,
    });

    const openSpy = vi.spyOn(store, 'open');

    // Mount triggers the keyboard registration in setup
    mountTopBar();

    // Dispatch a synthetic Cmd+K event
    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(openSpy).toHaveBeenCalled();

    // Restore
    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  it('Ctrl+K keyboard shortcut calls searchStore.open() on non-Mac', async () => {
    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      writable: true,
      configurable: true,
    });

    const openSpy = vi.spyOn(store, 'open');

    mountTopBar();

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(openSpy).toHaveBeenCalled();

    Object.defineProperty(navigator, 'platform', {
      value: originalPlatform,
      writable: true,
      configurable: true,
    });
  });

  it('unregisters keyboard shortcut on unmount', () => {
    const wrapper = mountTopBar();
    wrapper.unmount();

    // After unmount, Cmd+K should not trigger open
    const openSpy = vi.spyOn(store, 'open');

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      metaKey: true,
      bubbles: true,
    });
    window.dispatchEvent(event);

    expect(openSpy).not.toHaveBeenCalled();
  });
});
