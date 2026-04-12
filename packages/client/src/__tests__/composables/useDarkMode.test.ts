import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

// --- localStorage mock ---
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      const rest = Object.fromEntries(Object.entries(store).filter(([k]) => k !== key));
      store = rest;
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// --- matchMedia mock ---
let mockMatchMediaMatches = true;
const matchMediaMock = vi.fn((query: string) => ({
  matches: mockMatchMediaMatches,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

Object.defineProperty(globalThis, 'matchMedia', {
  value: matchMediaMock,
  writable: true,
});

// --- document.documentElement mock ---
const classListMock = {
  add: vi.fn(),
  remove: vi.fn(),
  contains: vi.fn(),
};

Object.defineProperty(document, 'documentElement', {
  value: { classList: classListMock },
  writable: true,
});

import { useDarkMode } from '@/composables/useDarkMode';
import { useUiStore } from '@/stores/ui';

describe('useDarkMode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    vi.clearAllMocks();
    mockMatchMediaMatches = true;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should read dark mode from localStorage when forge-theme is "dark"', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { darkMode } = useDarkMode();

      expect(darkMode.value).toBe(true);
    });

    it('should read light mode from localStorage when forge-theme is "light"', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { darkMode } = useDarkMode();

      expect(darkMode.value).toBe(false);
    });

    it('should fall back to system preference (dark) when no localStorage value', () => {
      localStorageMock.getItem.mockReturnValue(null);
      mockMatchMediaMatches = true;

      const { darkMode } = useDarkMode();

      expect(darkMode.value).toBe(true);
    });

    it('should fall back to system preference (light) when no localStorage value', () => {
      localStorageMock.getItem.mockReturnValue(null);
      mockMatchMediaMatches = false;

      const { darkMode } = useDarkMode();

      expect(darkMode.value).toBe(false);
    });

    it('should default to dark when localStorage is null and matchMedia is unavailable', () => {
      localStorageMock.getItem.mockReturnValue(null);
      // @ts-expect-error testing unavailable matchMedia
      globalThis.matchMedia = undefined;

      const { darkMode } = useDarkMode();

      expect(darkMode.value).toBe(true);

      // restore
      globalThis.matchMedia = matchMediaMock;
    });

    it('should apply dark class on html element when dark on init', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      useDarkMode();

      expect(classListMock.add).toHaveBeenCalledWith('dark');
    });

    it('should remove dark class on html element when light on init', () => {
      localStorageMock.getItem.mockReturnValue('light');

      useDarkMode();

      expect(classListMock.remove).toHaveBeenCalledWith('dark');
    });

    it('should sync store darkMode on init', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      useDarkMode();

      const store = useUiStore();
      expect(store.darkMode).toBe(true);
    });

    it('should sync store darkMode to false when light on init', () => {
      localStorageMock.getItem.mockReturnValue('light');

      useDarkMode();

      const store = useUiStore();
      expect(store.darkMode).toBe(false);
    });
  });

  describe('toggle', () => {
    it('should toggle dark mode from dark to light', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { darkMode, toggle } = useDarkMode();
      expect(darkMode.value).toBe(true);

      toggle();

      expect(darkMode.value).toBe(false);
    });

    it('should toggle dark mode from light to dark', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { darkMode, toggle } = useDarkMode();
      expect(darkMode.value).toBe(false);

      toggle();

      expect(darkMode.value).toBe(true);
    });

    it('should persist "light" to localStorage when toggling from dark', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { toggle } = useDarkMode();
      toggle();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-theme', 'light');
    });

    it('should persist "dark" to localStorage when toggling from light', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { toggle } = useDarkMode();
      toggle();

      expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-theme', 'dark');
    });

    it('should add dark class to html when toggling to dark', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { toggle } = useDarkMode();
      vi.clearAllMocks();

      toggle();

      expect(classListMock.add).toHaveBeenCalledWith('dark');
    });

    it('should remove dark class from html when toggling to light', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { toggle } = useDarkMode();
      vi.clearAllMocks();

      toggle();

      expect(classListMock.remove).toHaveBeenCalledWith('dark');
    });

    it('should sync store when toggling', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { toggle } = useDarkMode();
      const store = useUiStore();

      toggle();

      expect(store.darkMode).toBe(false);
    });
  });

  describe('setDarkMode', () => {
    it('should set dark mode to a specific value', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { darkMode, setDarkMode } = useDarkMode();
      setDarkMode(true);

      expect(darkMode.value).toBe(true);
    });

    it('should persist to localStorage when set to dark', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { setDarkMode } = useDarkMode();
      setDarkMode(true);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-theme', 'dark');
    });

    it('should persist to localStorage when set to light', () => {
      localStorageMock.getItem.mockReturnValue('dark');

      const { setDarkMode } = useDarkMode();
      setDarkMode(false);

      expect(localStorageMock.setItem).toHaveBeenCalledWith('forge-theme', 'light');
    });

    it('should update html class and store when set', () => {
      localStorageMock.getItem.mockReturnValue('light');

      const { setDarkMode } = useDarkMode();
      vi.clearAllMocks();

      setDarkMode(true);

      expect(classListMock.add).toHaveBeenCalledWith('dark');
      const store = useUiStore();
      expect(store.darkMode).toBe(true);
    });
  });
});
