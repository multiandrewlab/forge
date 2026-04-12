import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useTagsStore } from '../../stores/tags.js';
import type { Tag } from '@forge/shared';

const mockTag1: Tag = { id: 't1', name: 'typescript', postCount: 10 };
const mockTag2: Tag = { id: 't2', name: 'vue', postCount: 5 };
const mockTag3: Tag = { id: 't3', name: 'rust', postCount: 3 };

describe('useTagsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty subscribedTags and popularTags', () => {
    const store = useTagsStore();
    expect(store.subscribedTags).toEqual([]);
    expect(store.popularTags).toEqual([]);
  });

  it('setSubscribedTags replaces subscribedTags array', () => {
    const store = useTagsStore();
    store.setSubscribedTags([mockTag1, mockTag2]);
    expect(store.subscribedTags).toEqual([mockTag1, mockTag2]);
  });

  it('setPopularTags replaces popularTags array', () => {
    const store = useTagsStore();
    store.setPopularTags([mockTag2, mockTag3]);
    expect(store.popularTags).toEqual([mockTag2, mockTag3]);
  });

  it('addSubscription appends a tag', () => {
    const store = useTagsStore();
    store.addSubscription(mockTag1);
    expect(store.subscribedTags).toEqual([mockTag1]);
  });

  it('addSubscription does not add duplicate tag', () => {
    const store = useTagsStore();
    store.addSubscription(mockTag1);
    store.addSubscription(mockTag1);
    expect(store.subscribedTags).toEqual([mockTag1]);
  });

  it('addSubscription adds different tags', () => {
    const store = useTagsStore();
    store.addSubscription(mockTag1);
    store.addSubscription(mockTag2);
    expect(store.subscribedTags).toEqual([mockTag1, mockTag2]);
  });

  it('removeSubscription removes tag by id', () => {
    const store = useTagsStore();
    store.setSubscribedTags([mockTag1, mockTag2, mockTag3]);
    store.removeSubscription('t2');
    expect(store.subscribedTags).toEqual([mockTag1, mockTag3]);
  });

  it('removeSubscription is a no-op when tag id not found', () => {
    const store = useTagsStore();
    store.setSubscribedTags([mockTag1]);
    store.removeSubscription('nonexistent');
    expect(store.subscribedTags).toEqual([mockTag1]);
  });

  it('reset clears all state', () => {
    const store = useTagsStore();
    store.setSubscribedTags([mockTag1]);
    store.setPopularTags([mockTag2]);
    store.reset();
    expect(store.subscribedTags).toEqual([]);
    expect(store.popularTags).toEqual([]);
  });
});
