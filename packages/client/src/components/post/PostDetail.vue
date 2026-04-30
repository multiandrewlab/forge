<template>
  <div v-if="post" class="flex h-full flex-col overflow-y-auto p-6">
    <PostMetaHeader :post="post" />
    <PostActions :post="post" @fork="handleFork" />
    <!-- Multi-file layout -->
    <div v-if="files.length > 0" class="mt-4 flex flex-1 gap-3">
      <FileSidebar
        :files="files"
        :active-file-id="filesStore.activeFileId"
        :editable="false"
        @select="filesStore.setActiveFile"
      />
      <div class="flex-1 overflow-auto">
        <FilePreview v-if="activeFile" :file="activeFile" :post-id="fullPost!.id" />
        <CodeRunner
          v-if="fullPost?.contentType === 'snippet' && revision"
          :post-id="fullPost.id"
          :revision-id="revision.id"
          :language="fullPost.language"
          :files="files"
          :active-filename="activeFile?.filename"
        />
      </div>
    </div>

    <!-- Single-file layout (existing) -->
    <div v-else class="mt-4 flex-1">
      <LinkPreviewCard
        v-if="fullPost?.linkUrl"
        class="mb-3"
        :link-url="fullPost.linkUrl"
        :link-preview="fullPost.linkPreview"
        :is-author="isPostAuthor"
        @refresh="handleRefreshPreview"
      />
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
      <CodeRunner
        v-if="fullPost?.contentType === 'snippet' && revision"
        :post-id="fullPost.id"
        :revision-id="revision.id"
        :language="fullPost.language"
        :single-file-content="revision.content"
      />
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
import type { PostWithAuthor, PostWithRevision, PostFile } from '@forge/shared';
import CodeViewer from './CodeViewer.vue';
import FileSidebar from './FileSidebar.vue';
import FilePreview from './FilePreview.vue';
import PostMetaHeader from './PostMetaHeader.vue';
import PostActions from './PostActions.vue';
import CommentSection from './CommentSection.vue';
import CommentInput from './CommentInput.vue';
import InlineComment from './InlineComment.vue';
import CodeRunner from './CodeRunner.vue';
import LinkPreviewCard from './LinkPreviewCard.vue';
import { useRouter } from 'vue-router';
import { useComments } from '../../composables/useComments.js';
import { useCommentsStore } from '../../stores/comments.js';
import { useAuthStore } from '../../stores/auth.js';
import { useFilesStore } from '../../stores/files.js';
import { usePosts } from '../../composables/usePosts.js';

const props = defineProps<{ post: PostWithAuthor | null }>();

const fullPost = ref<PostWithRevision | null>(null);
const inlineCommentLine = ref<number | null>(null);

const revision = computed(() => fullPost.value?.revisions?.[0] ?? null);

const isPostAuthor = computed(() => {
  const u = authStore.user;
  const p = fullPost.value;
  if (u === null || p === null) return false;
  return u.id === p.authorId;
});

const files = ref<PostFile[]>([]);

const router = useRouter();
const authStore = useAuthStore();
const commentsStore = useCommentsStore();
const filesStore = useFilesStore();
const { fetchComments, addComment } = useComments();
const { forkPost } = usePosts();

const activeFile = computed(
  () => files.value.find((f) => f.id === filesStore.activeFileId) ?? null,
);

watch(
  () => props.post?.id,
  async (id) => {
    if (!id) {
      fullPost.value = null;
      files.value = [];
      filesStore.$reset();
      commentsStore.clearComments();
      inlineCommentLine.value = null;
      return;
    }
    try {
      const response = await apiFetch(`/api/posts/${id}`);
      if (response.ok) {
        // Server wraps the response as `{ post: PostWithRevision }`. Older test
        // mocks return the bare post — handle both for compatibility (mirrors
        // usePosts.fetchPost at composables/usePosts.ts:79).
        const raw = (await response.json()) as PostWithRevision | { post: PostWithRevision };
        const postData = 'post' in raw ? raw.post : raw;
        fullPost.value = postData;
        const rev = postData.revisions?.[0];
        if (rev) {
          commentsStore.setCurrentRevisionId(rev.id);
        }
        await fetchComments(id);
        if (rev) {
          // Fetch files associated with this revision for multi-file layout
          await filesStore.fetchFiles(id, rev.id);
          files.value = filesStore.filesByRevision[rev.id] ?? [];
          if (files.value.length > 0) {
            // eslint-disable-next-line no-undef
            console.info('[analytics] post.view.multifile', {
              postId: fullPost.value?.id,
              fileCount: files.value.length,
            });
          }
        }
      }
    } catch {
      fullPost.value = null;
      files.value = [];
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

async function handleFork(): Promise<void> {
  if (!props.post) return;
  const newPostId = await forkPost(props.post.id);
  if (newPostId) {
    router.push(`/posts/${newPostId}/edit`);
  }
}

async function handleRefreshPreview(): Promise<void> {
  // Capture once so the post-await assignment is unconditional (the v-if
  // guard on the LinkPreviewCard already guarantees fullPost is non-null
  // when this handler is reachable).
  const post = fullPost.value;
  if (!post) return;
  const res = await apiFetch(`/api/posts/${post.id}/refresh-preview`, { method: 'POST' });
  if (res.ok) {
    const body = (await res.json()) as { post: PostWithRevision };
    post.linkPreview = body.post.linkPreview;
  }
}
</script>
