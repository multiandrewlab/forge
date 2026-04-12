<template>
  <div v-if="post" class="flex h-full flex-col overflow-y-auto p-6">
    <PostMetaHeader :post="post" />
    <PostActions :post="post" />
    <div class="mt-4 flex-1">
      <CodeViewer
        v-if="revision"
        :code="revision.content"
        :language="post.language ?? undefined"
        @line-click="handleLineClick"
      />
      <!-- Existing inline comments for clicked line -->
      <div v-if="inlineCommentLine !== null" class="mt-2">
        <p class="text-xs text-gray-400 mb-1">Line {{ inlineCommentLine }}</p>
        <InlineComment
          v-for="c in commentsStore.inlineComments.get(inlineCommentLine) ?? []"
          :key="c.id"
          :comment="c"
        />
        <CommentInput
          placeholder="Add inline comment..."
          :show-cancel="true"
          @submit="handleInlineComment"
          @cancel="inlineCommentLine = null"
        />
      </div>
      <!-- Inline comment indicators -->
      <div v-for="[line, lineComments] in commentsStore.inlineComments" :key="line" class="mt-1">
        <button
          v-if="inlineCommentLine !== line"
          class="text-xs text-primary hover:underline"
          @click="inlineCommentLine = line"
        >
          {{ lineComments.length }} comment{{ lineComments.length > 1 ? 's' : '' }} on line
          {{ line }}
        </button>
      </div>
    </div>
    <div class="mt-6 border-t border-gray-700 pt-4">
      <CommentSection
        v-if="fullPost"
        :post-id="fullPost.id"
        :current-user-id="authStore.user?.id"
      />
    </div>
  </div>
  <div v-else class="flex h-full items-center justify-center">
    <p class="text-sm text-gray-500">Select a post to view</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { apiFetch } from '../../lib/api.js';
import type { PostWithAuthor, PostWithRevision } from '@forge/shared';
import CodeViewer from './CodeViewer.vue';
import PostMetaHeader from './PostMetaHeader.vue';
import PostActions from './PostActions.vue';
import CommentSection from './CommentSection.vue';
import CommentInput from './CommentInput.vue';
import InlineComment from './InlineComment.vue';
import { useComments } from '../../composables/useComments.js';
import { useCommentsStore } from '../../stores/comments.js';
import { useAuthStore } from '../../stores/auth.js';

const props = defineProps<{ post: PostWithAuthor | null }>();

const fullPost = ref<PostWithRevision | null>(null);
const inlineCommentLine = ref<number | null>(null);

const revision = computed(() => fullPost.value?.revisions?.[0] ?? null);

const authStore = useAuthStore();
const commentsStore = useCommentsStore();
const { fetchComments, addComment } = useComments();

watch(
  () => props.post?.id,
  async (id) => {
    if (!id) {
      fullPost.value = null;
      commentsStore.clearComments();
      inlineCommentLine.value = null;
      return;
    }
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (response.ok) {
        const postData = (await response.json()) as PostWithRevision;
        fullPost.value = postData;
        const rev = postData.revisions?.[0];
        if (rev) {
          commentsStore.setCurrentRevisionId(rev.id);
        }
        await fetchComments(id);
      }
    } catch {
      fullPost.value = null;
      commentsStore.clearComments();
      inlineCommentLine.value = null;
    }
  },
  { immediate: true },
);

function handleLineClick(lineNumber: number): void {
  inlineCommentLine.value = lineNumber;
}

async function handleInlineComment(body: string): Promise<void> {
  if (inlineCommentLine.value === null || !fullPost.value) return;
  const rev = revision.value;
  await addComment(fullPost.value.id, {
    body,
    lineNumber: inlineCommentLine.value,
    revisionId: rev?.id,
  });
}
</script>
