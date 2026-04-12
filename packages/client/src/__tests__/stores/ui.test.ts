import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUiStore } from '../../stores/ui.js';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    clear: () => {
      store = {};
    },
  };
})();
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });

describe('useUiStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('initializes sidebarCollapsed from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('true');
    const store = useUiStore();
    expect(store.sidebarCollapsed).toBe(true);
  });

  it('defaults sidebarCollapsed to false', () => {
    const store = useUiStore();
    expect(store.sidebarCollapsed).toBe(false);
  });

  it('persists sidebarCollapsed to localStorage on change', () => {
    const store = useUiStore();
    store.toggleSidebar();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-sidebar-collapsed', 'true');
  });

  it('initializes searchModalOpen to false', () => {
    const store = useUiStore();
    expect(store.searchModalOpen).toBe(false);
  });

  it('initializes darkMode to true (default dark)', () => {
    const store = useUiStore();
    expect(store.darkMode).toBe(true);
  });

  it('darkMode syncs with setDarkMode', () => {
    const store = useUiStore();
    expect(store.darkMode).toBe(true);
    store.setDarkMode(false);
    expect(store.darkMode).toBe(false);
    store.setDarkMode(true);
    expect(store.darkMode).toBe(true);
  });
});
