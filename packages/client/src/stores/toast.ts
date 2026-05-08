import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ToastKind = 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function push(input: Omit<Toast, 'id'>): void {
    toasts.value.push({ id: generateId(), ...input });
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, dismiss };
});
