<template>
  <div class="flex flex-col gap-1">
    <div class="flex items-start gap-2 rounded p-2 hover:bg-surface-700">
      <div class="flex-1">
        <div class="flex items-center gap-2 text-xs text-gray-400">
          <span class="font-medium text-gray-300">
            {{ node.author?.displayName ?? 'Deleted user' }}
          </span>
          <span>{{ timeAgo(node.createdAt) }}</span>
        </div>

        <!-- Edit mode -->
        <CommentInput
          v-if="isEditing"
          :initial-value="node.body"
          placeholder="Edit comment..."
          :show-cancel="true"
          class="mt-1"
          @submit="handleEdit"
          @cancel="isEditing = false"
        />

        <!-- Display mode -->
        <template v-else>
          <p class="mt-1 text-sm text-gray-200 whitespace-pre-wrap">{{ node.body }}</p>
          <div class="mt-1 flex items-center gap-2">
            <button
              data-testid="reply-btn"
              class="text-xs text-gray-500 hover:text-gray-300"
              @click="showReplyInput = !showReplyInput"
            >
              Reply
            </button>
            <button
              v-if="isOwner"
              data-testid="edit-btn"
              class="text-xs text-gray-500 hover:text-gray-300"
              @click="isEditing = true"
            >
              Edit
            </button>
            <button
              v-if="isOwner"
              data-testid="delete-btn"
              class="text-xs text-red-500 hover:text-red-400"
              @click="handleDelete"
            >
              Delete
            </button>
          </div>
        </template>

        <CommentInput
          v-if="showReplyInput && !isEditing"
          placeholder="Write a reply..."
          :show-cancel="true"
          class="mt-2"
          @submit="handleReply"
          @cancel="showReplyInput = false"
        />
      </div>
    </div>
    <div v-if="node.children.length > 0" class="ml-6 border-l border-gray-700 pl-2">
      <CommentThread
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :post-id="postId"
        :current-user-id="currentUserId"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CommentTreeNode } from '../../stores/comments.js';
import { useComments } from '../../composables/useComments.js';
import CommentInput from './CommentInput.vue';

const props = defineProps<{
  node: CommentTreeNode;
  postId: string;
  currentUserId?: string;
}>();

const showReplyInput = ref(false);
const isEditing = ref(false);
const { addComment, editComment, deleteComment } = useComments();

const isOwner = computed(
  () => props.currentUserId != null && props.node.author?.id === props.currentUserId,
);

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function handleReply(body: string): Promise<void> {
  await addComment(props.postId, { body, parentId: props.node.id });
  showReplyInput.value = false;
}

async function handleEdit(body: string): Promise<void> {
  await editComment(props.postId, props.node.id, body);
  isEditing.value = false;
}

async function handleDelete(): Promise<void> {
  await deleteComment(props.postId, props.node.id);
}
</script>
