<template>
  <div
    v-if="state === 'loading'"
    data-testid="tag-page-loading"
    class="p-6 text-center text-gray-400"
  >
    Loading tag…
  </div>
  <div v-else-if="state === 'not-found'" data-testid="tag-not-found" class="p-6 text-center">
    <p class="text-gray-400">Tag not found</p>
    <RouterLink to="/" class="text-primary hover:underline"> Back to home </RouterLink>
  </div>
  <div v-else-if="tag" data-testid="tag-page" class="mx-auto max-w-4xl px-4 py-6">
    <h1 data-testid="tag-page-title" class="mb-2 text-2xl font-bold text-white">#{{ tag.name }}</h1>
    <p class="mb-4 text-sm text-gray-400">
      {{ tag.postCount }} posts · {{ tag.subscriberCount }} subscribers
    </p>
    <TagSubscribeButton
      :tag="tag"
      :loading="subscribePending"
      :error="subscribeError"
      @subscribe="handleSubscribe"
      @unsubscribe="handleUnsubscribe"
    />
    <div
      v-if="posts.length === 0"
      data-testid="tag-page-empty"
      class="mt-8 text-center text-gray-500"
    >
      No posts tagged #{{ tag.name }} yet.
    </div>
    <PostList
      v-else
      :posts="posts"
      :selected-post-id="null"
      :loading="false"
      :error="null"
      :has-more="false"
      :current-sort="'recent'"
      :current-filter="null"
      :current-tag="tag.name"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { apiFetch } from '../lib/api.js';
import { useTags } from '../composables/useTags.js';
import TagSubscribeButton from '../components/tags/TagSubscribeButton.vue';
import PostList from '../components/post/PostList.vue';
import type { Tag, PostWithAuthor } from '@forge/shared';

interface TagDetail extends Tag {
  subscriberCount: number;
}

const route = useRoute();
const state = ref<'loading' | 'success' | 'not-found'>('loading');
const tag = ref<TagDetail | null>(null);
const posts = ref<PostWithAuthor[]>([]);
const subscribePending = ref(false);
const subscribeError = ref<string | null>(null);
const { subscribe, unsubscribe } = useTags();

async function load(name: string): Promise<void> {
  state.value = 'loading';
  tag.value = null;
  posts.value = [];
  const tagRes = await apiFetch(`/api/tags/${encodeURIComponent(name)}`);
  if (!tagRes.ok) {
    state.value = tagRes.status === 404 ? 'not-found' : 'loading';
    return;
  }
  tag.value = (await tagRes.json()) as TagDetail;
  const feedRes = await apiFetch(`/api/posts/feed?tag=${encodeURIComponent(name)}`);
  if (feedRes.ok) {
    const data = (await feedRes.json()) as { posts: PostWithAuthor[] };
    posts.value = data.posts;
  }
  state.value = 'success';
}

watch(
  () => route.params.name as string,
  (n) => {
    if (n) void load(n);
  },
  { immediate: true },
);

async function handleSubscribe(): Promise<void> {
  // Only callable from within v-if="tag" block, so tag.value is non-null
  const current = tag.value as TagDetail;
  subscribePending.value = true;
  subscribeError.value = null;
  try {
    await subscribe(current);
  } catch (e) {
    subscribeError.value = String(e);
  } finally {
    subscribePending.value = false;
  }
}

async function handleUnsubscribe(): Promise<void> {
  // Only callable from within v-if="tag" block, so tag.value is non-null
  const current = tag.value as TagDetail;
  subscribePending.value = true;
  subscribeError.value = null;
  try {
    await unsubscribe(current.id);
  } catch (e) {
    subscribeError.value = String(e);
  } finally {
    subscribePending.value = false;
  }
}
</script>
