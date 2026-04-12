import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { Tag } from '@forge/shared';

export const useTagsStore = defineStore('tags', () => {
  const subscribedTags = ref<Tag[]>([]);
  const popularTags = ref<Tag[]>([]);

  function setSubscribedTags(tags: Tag[]): void {
    subscribedTags.value = tags;
  }

  function setPopularTags(tags: Tag[]): void {
    popularTags.value = tags;
  }

  function addSubscription(tag: Tag): void {
    const exists = subscribedTags.value.some((t) => t.id === tag.id);
    if (!exists) {
      subscribedTags.value = [...subscribedTags.value, tag];
    }
  }

  function removeSubscription(tagId: string): void {
    subscribedTags.value = subscribedTags.value.filter((t) => t.id !== tagId);
  }

  function reset(): void {
    subscribedTags.value = [];
    popularTags.value = [];
  }

  return {
    subscribedTags,
    popularTags,
    setSubscribedTags,
    setPopularTags,
    addSubscription,
    removeSubscription,
    reset,
  };
});
