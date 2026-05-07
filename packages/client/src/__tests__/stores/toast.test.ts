import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToastStore } from '@/stores/toast';

describe('toast store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts with empty queue', () => {
    const store = useToastStore();
    expect(store.toasts).toEqual([]);
  });

  it('push appends a toast with auto-generated id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]?.kind).toBe('error');
    expect(store.toasts[0]?.message).toBe('Boom');
    expect(typeof store.toasts[0]?.id).toBe('string');
  });

  it('dismiss removes by id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'A' });
    store.push({ kind: 'error', message: 'B' });
    const idA = store.toasts[0]?.id;
    if (idA === undefined) throw new Error('expected first toast id to be defined');
    store.dismiss(idA);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]?.message).toBe('B');
  });

  it('dismiss is no-op for unknown id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'A' });
    store.dismiss('does-not-exist');
    expect(store.toasts).toHaveLength(1);
  });
});
