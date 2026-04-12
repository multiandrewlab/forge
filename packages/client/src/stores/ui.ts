import { ref } from 'vue';
import { defineStore } from 'pinia';

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(localStorage.getItem('forge-sidebar-collapsed') === 'true');
  const searchModalOpen = ref(false);
  const darkMode = ref(true);

  function toggleSidebar(): void {
    sidebarCollapsed.value = !sidebarCollapsed.value;
    localStorage.setItem('forge-sidebar-collapsed', String(sidebarCollapsed.value));
  }

  function setDarkMode(value: boolean): void {
    darkMode.value = value;
  }

  return {
    sidebarCollapsed,
    searchModalOpen,
    darkMode,
    toggleSidebar,
    setDarkMode,
  };
});
