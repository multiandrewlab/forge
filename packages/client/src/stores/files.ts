import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { PostFile } from '@forge/shared';
import { apiFetch } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export const useFilesStore = defineStore('files', () => {
  const filesByRevision = ref<Record<string, PostFile[]>>({});
  const activeFileId = ref<string | null>(null);
  const stagedFiles = ref<PostFile[]>([]);
  const uploadProgress = ref<Record<string, number>>({});

  function setActiveFile(fileId: string | null): void {
    activeFileId.value = fileId;
  }

  async function fetchFiles(postId: string, revisionId: string): Promise<void> {
    const response = await apiFetch(`/api/posts/${postId}/files?revisionId=${revisionId}`);

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as { files: PostFile[] };
    filesByRevision.value[revisionId] = data.files;

    const firstFile = data.files[0];
    if (!activeFileId.value && firstFile) {
      activeFileId.value = firstFile.id;
    }
  }

  async function uploadFile(postId: string, file: File): Promise<PostFile | null> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e: { lengthComputable: boolean; loaded: number; total: number }) => {
        if (e.lengthComputable) {
          uploadProgress.value[file.name] = Math.round((e.loaded / e.total) * 100);
        }
      });

      xhr.addEventListener('load', () => {
        uploadProgress.value = Object.fromEntries(
          Object.entries(uploadProgress.value).filter(([key]) => key !== file.name),
        );
        if (xhr.status === 201) {
          const data = JSON.parse(xhr.responseText) as { file: PostFile };
          stagedFiles.value.push(data.file);
          if (!activeFileId.value) {
            activeFileId.value = data.file.id;
          }
          resolve(data.file);
        } else {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      });

      xhr.addEventListener('error', () => {
        uploadProgress.value = Object.fromEntries(
          Object.entries(uploadProgress.value).filter(([key]) => key !== file.name),
        );
        reject(new Error('Upload failed'));
      });

      const authStore = useAuthStore();
      xhr.open('POST', `/api/posts/${postId}/files`);
      if (authStore.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${authStore.accessToken}`);
      }
      xhr.send(formData);
    });
  }

  async function deleteStagedFile(postId: string, fileId: string): Promise<void> {
    const response = await apiFetch(`/api/posts/${postId}/files/${fileId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      return;
    }

    stagedFiles.value = stagedFiles.value.filter((f) => f.id !== fileId);
    if (activeFileId.value === fileId) {
      activeFileId.value = null;
    }
  }

  function clearStaged(): void {
    stagedFiles.value = [];
    uploadProgress.value = {};
  }

  function $reset(): void {
    filesByRevision.value = {};
    activeFileId.value = null;
    stagedFiles.value = [];
    uploadProgress.value = {};
  }

  return {
    filesByRevision,
    activeFileId,
    stagedFiles,
    uploadProgress,
    setActiveFile,
    fetchFiles,
    uploadFile,
    deleteStagedFile,
    clearStaged,
    $reset,
  };
});
