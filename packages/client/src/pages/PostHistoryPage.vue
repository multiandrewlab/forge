<template>
  <div class="mx-auto max-w-5xl px-4 py-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold text-gray-100">Revision History</h1>
        <p v-if="currentPost" class="mt-1 text-sm text-gray-400">
          {{ currentPost.title }}
        </p>
      </div>
      <router-link
        :to="{ name: 'post-view', params: { id: postId } }"
        class="text-sm text-gray-400 hover:text-gray-200"
      >
        Back to post
      </router-link>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <p class="text-sm text-gray-400">Loading revisions...</p>
    </div>

    <!-- Content -->
    <div v-else class="grid grid-cols-[280px_1fr] gap-6">
      <!-- Left: Timeline + Restore -->
      <div class="flex flex-col gap-4">
        <p class="text-xs text-gray-500">
          Select two revisions to compare. Click once to select, click again to deselect.
        </p>
        <RevisionTimeline
          :revisions="revisions"
          :selected-ids="selectedIds"
          @select="handleSelect"
        />
        <RestoreButton
          v-if="selectedIds.length === 1 && !isLatestSelected"
          :revision-number="selectedRevisionNumber"
          :loading="restoring"
          @restore="handleRestore"
        />
      </div>

      <!-- Right: Diff viewer -->
      <div>
        <div
          v-if="selectedIds.length < 2"
          class="flex items-center justify-center rounded-md border border-gray-700 py-12"
        >
          <p class="text-sm text-gray-500">
            {{
              selectedIds.length === 0
                ? 'Select two revisions to compare'
                : 'Select one more revision to compare'
            }}
          </p>
        </div>
        <RevisionDiffViewer
          v-else-if="leftRevision && rightRevision"
          :left-content="leftRevision.content"
          :right-content="rightRevision.content"
          :left-label="'Rev ' + leftRevision.revisionNumber"
          :right-label="'Rev ' + rightRevision.revisionNumber"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute } from 'vue-router';
import { usePosts } from '@/composables/usePosts';
import RevisionTimeline from '@/components/history/RevisionTimeline.vue';
import RevisionDiffViewer from '@/components/history/RevisionDiffViewer.vue';
import RestoreButton from '@/components/history/RestoreButton.vue';
import type { PostRevision } from '@forge/shared';

const route = useRoute();
const postId = route.params.id as string;
const { fetchRevisions, restoreRevision, fetchPost, currentPost } = usePosts();

const revisions = ref<PostRevision[]>([]);
const selectedIds = ref<string[]>([]);
const loading = ref(true);
const restoring = ref(false);

const isLatestSelected = computed(() => {
  if (revisions.value.length === 0 || selectedIds.value.length !== 1) return false;
  return selectedIds.value[0] === revisions.value[0].id;
});

const selectedRevisionNumber = computed(() => {
  if (selectedIds.value.length !== 1) return 0;
  const rev = revisions.value.find((r) => r.id === selectedIds.value[0]);
  return rev?.revisionNumber ?? 0;
});

const leftRevision = computed(() => {
  if (selectedIds.value.length !== 2) return null;
  const revs = selectedIds.value
    .map((id) => revisions.value.find((r) => r.id === id))
    .filter((r): r is PostRevision => r !== undefined)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  return revs[0] ?? null;
});

const rightRevision = computed(() => {
  if (selectedIds.value.length !== 2) return null;
  const revs = selectedIds.value
    .map((id) => revisions.value.find((r) => r.id === id))
    .filter((r): r is PostRevision => r !== undefined)
    .sort((a, b) => a.revisionNumber - b.revisionNumber);
  return revs[1] ?? null;
});

function handleSelect(revisionId: string): void {
  const idx = selectedIds.value.indexOf(revisionId);
  if (idx >= 0) {
    selectedIds.value = selectedIds.value.filter((id) => id !== revisionId);
  } else if (selectedIds.value.length < 2) {
    selectedIds.value = [...selectedIds.value, revisionId];
  } else {
    // Replace the oldest selection
    selectedIds.value = [selectedIds.value[1], revisionId];
  }
}

async function handleRestore(revisionNumber: number): Promise<void> {
  restoring.value = true;
  const result = await restoreRevision(postId, revisionNumber);
  restoring.value = false;

  if (result) {
    selectedIds.value = [];
    await loadRevisions();
  }
}

async function loadRevisions(): Promise<void> {
  loading.value = true;
  revisions.value = await fetchRevisions(postId);
  loading.value = false;
}

onMounted(async () => {
  await Promise.all([loadRevisions(), fetchPost(postId)]);
});
</script>
