<template>
  <div class="flex flex-col gap-4">
    <h3 class="text-sm font-medium text-gray-400">Comments</h3>

    <!-- General comments (threaded) -->
    <div v-if="store.commentTree.length > 0" class="flex flex-col gap-2">
      <CommentThread
        v-for="node in store.commentTree"
        :key="node.id"
        :node="node"
        :post-id="postId"
        :current-user-id="currentUserId"
      />
    </div>
    <p v-else class="text-sm text-gray-500">No comments yet.</p>

    <!-- Stale comments from older revisions -->
    <div v-if="store.staleComments.length > 0" class="mt-4">
      <h4 class="text-xs font-medium text-gray-500">Previous comments</h4>
      <div class="mt-2 flex flex-col gap-1">
        <div
          v-for="comment in store.staleComments"
          :key="comment.id"
          class="rounded border border-gray-700 bg-surface-800 p-2 text-sm"
        >
          <div class="flex items-center gap-2 text-xs text-gray-500">
            <span class="font-medium text-gray-400">
              {{ comment.author?.displayName ?? 'Deleted user' }}
            </span>
            <span v-if="comment.revisionNumber" class="rounded bg-surface-700 px-1.5 py-0.5">
              Left on revision {{ comment.revisionNumber }}
            </span>
          </div>
          <p class="mt-1 text-gray-300 whitespace-pre-wrap">{{ comment.body }}</p>
        </div>
      </div>
    </div>

    <!-- New comment input -->
    <CommentInput placeholder="Add a comment..." @submit="handleNewComment" />
  </div>
</template>

<script setup lang="ts">
import { useCommentsStore } from '../../stores/comments.js';
import { useComments } from '../../composables/useComments.js';
import CommentThread from './CommentThread.vue';
import CommentInput from './CommentInput.vue';

const props = defineProps<{ postId: string; currentUserId?: string }>();
const store = useCommentsStore();
const { addComment } = useComments();

async function handleNewComment(body: string): Promise<void> {
  await addComment(props.postId, { body });
}
</script>
