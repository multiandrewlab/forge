import { computed } from 'vue';
import { useUiStore } from '../stores/ui.js';

export function useDarkMode() {
  const store = useUiStore();

  // Initialize from localStorage → system preference → default dark
  const stored = localStorage.getItem('forge-theme');
  if (stored) {
    store.setDarkMode(stored === 'dark');
  } else if (typeof globalThis.matchMedia === 'function') {
    const prefersDark = globalThis.matchMedia('(prefers-color-scheme: dark)').matches;
    store.setDarkMode(prefersDark);
  } else {
    store.setDarkMode(true);
  }

  const darkMode = computed(() => store.darkMode);

  function applyClass(dark: boolean): void {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  // Apply immediately on init
  applyClass(store.darkMode);

  function toggle(): void {
    const newValue = !store.darkMode;
    store.setDarkMode(newValue);
    localStorage.setItem('forge-theme', newValue ? 'dark' : 'light');
    applyClass(newValue);
  }

  function setDarkMode(value: boolean): void {
    store.setDarkMode(value);
    localStorage.setItem('forge-theme', value ? 'dark' : 'light');
    applyClass(value);
  }

  return { darkMode, toggle, setDarkMode };
}
