import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { PostWithRevision } from '@forge/shared';

export type SaveStatus = 'saved' | 'saving' | 'error' | 'unsaved';

export const usePostsStore = defineStore('posts', () => {
  const currentPost = ref<PostWithRevision | null>(null);
  const isDirty = ref(false);
  const saveStatus = ref<SaveStatus>('unsaved');
  const lastSavedAt = ref<Date | null>(null);

  function setPost(post: PostWithRevision | null): void {
    currentPost.value = post;
  }

  function setDirty(dirty: boolean): void {
    isDirty.value = dirty;
    if (dirty) {
      saveStatus.value = 'unsaved';
    }
  }

  function setSaveStatus(status: SaveStatus): void {
    saveStatus.value = status;
    if (status === 'saved') {
      lastSavedAt.value = new Date();
      isDirty.value = false;
    }
  }

  function clearPost(): void {
    currentPost.value = null;
    isDirty.value = false;
    saveStatus.value = 'unsaved';
    lastSavedAt.value = null;
  }

  return {
    currentPost,
    isDirty,
    saveStatus,
    lastSavedAt,
    setPost,
    setDirty,
    setSaveStatus,
    clearPost,
  };
});
