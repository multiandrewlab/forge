<!-- packages/client/src/components/shell/TheSidebar.vue -->
<template>
  <!-- Desktop/tablet sidebar -->
  <aside
    class="hidden shrink-0 flex-col border-r border-gray-700 bg-surface transition-all duration-200 md:flex"
    :class="collapsed ? 'w-14' : 'w-60'"
  >
    <div class="flex flex-1 flex-col overflow-y-auto p-3">
      <!-- Create button -->
      <RouterLink
        to="/posts/new"
        class="mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
      >
        <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span v-if="!collapsed">Create New Post</span>
      </RouterLink>

      <!-- Nav links -->
      <nav class="space-y-1">
        <RouterLink
          v-for="link in navLinks"
          :key="link.to"
          :to="link.to"
          :data-testid="link.testid"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
          active-class="bg-gray-700 text-white"
        >
          <component :is="link.icon" class="h-5 w-5 shrink-0" />
          <span v-if="!collapsed">{{ link.label }}</span>
        </RouterLink>
      </nav>

      <!-- Tags section -->
      <div v-if="!collapsed" class="mt-6 border-t border-gray-700 pt-4">
        <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Followed Tags
        </h3>
        <div v-if="subscribedTags.length > 0" class="space-y-1">
          <button
            v-for="tag in subscribedTags"
            :key="tag.id"
            :data-testid="`subscribed-tag-link-${tag.name}`"
            class="block w-full px-3 text-left text-sm text-gray-400 hover:text-white"
            @click="handleTagClick(tag.name)"
          >
            #{{ tag.name }}
          </button>
        </div>
        <p v-else class="px-3 text-xs text-gray-600">No followed tags</p>
      </div>

      <!-- Popular Tags section (issue #49) -->
      <div v-if="!collapsed" class="mt-6 border-t border-gray-700 pt-4">
        <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Popular Tags
        </h3>
        <div v-if="popularTags.length > 0" data-testid="popular-tags-list" class="space-y-1">
          <div
            v-for="tag in popularTags"
            :key="tag.id"
            :data-testid="`popular-tag-row-${tag.name}`"
            class="flex items-center justify-between gap-2 px-3 py-1"
          >
            <RouterLink
              :to="{ name: 'tag-view', params: { name: tag.name } }"
              class="truncate text-sm text-gray-300 hover:text-white"
            >
              #{{ tag.name }}
            </RouterLink>
            <TagSubscribeButton
              :tag="tag"
              :loading="pendingTagId === tag.id"
              @subscribe="handleSubscribe(tag)"
              @unsubscribe="handleUnsubscribe(tag.id)"
            />
          </div>
        </div>
        <p v-else class="px-3 text-xs text-gray-600">No popular tags</p>
      </div>
    </div>

    <!-- User profile at bottom -->
    <div class="border-t border-gray-700 p-3">
      <UserAvatar :collapsed="collapsed" />
    </div>
  </aside>

  <!-- Mobile overlay -->
  <Teleport to="body">
    <Transition name="sidebar">
      <div v-if="overlayOpen" class="fixed inset-0 z-40 md:hidden">
        <div class="absolute inset-0 bg-black/50" @click="$emit('closeOverlay')" />
        <aside
          class="absolute inset-y-0 left-0 w-60 flex-col border-r border-gray-700 bg-surface flex"
        >
          <div class="flex flex-1 flex-col overflow-y-auto p-3">
            <RouterLink
              to="/posts/new"
              class="mb-4 flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              @click="$emit('closeOverlay')"
            >
              <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4v16m8-8H4"
                />
              </svg>
              <span>Create New Post</span>
            </RouterLink>
            <nav class="space-y-1">
              <RouterLink
                v-for="link in navLinks"
                :key="link.to"
                :to="link.to"
                :data-testid="link.testid"
                class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white"
                active-class="bg-gray-700 text-white"
                @click="$emit('closeOverlay')"
              >
                <component :is="link.icon" class="h-5 w-5 shrink-0" />
                <span>{{ link.label }}</span>
              </RouterLink>
            </nav>
            <div class="mt-6 border-t border-gray-700 pt-4">
              <h3 class="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                Followed Tags
              </h3>
              <div v-if="subscribedTags.length > 0" class="space-y-1">
                <button
                  v-for="tag in subscribedTags"
                  :key="tag.id"
                  :data-testid="`subscribed-tag-link-${tag.name}`"
                  class="block w-full px-3 text-left text-sm text-gray-400 hover:text-white"
                  @click="handleTagClick(tag.name)"
                >
                  #{{ tag.name }}
                </button>
              </div>
              <p v-else class="px-3 text-xs text-gray-600">No followed tags</p>
            </div>
          </div>
          <div class="border-t border-gray-700 p-3">
            <UserAvatar />
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { h, onMounted, ref, type FunctionalComponent } from 'vue';
import { RouterLink } from 'vue-router';
import UserAvatar from './UserAvatar.vue';
import TagSubscribeButton from '../tags/TagSubscribeButton.vue';
import { useTags } from '../../composables/useTags.js';
import { useFeed } from '../../composables/useFeed.js';
import type { Tag } from '@forge/shared';

defineProps<{ collapsed: boolean; overlayOpen: boolean }>();
defineEmits<{ closeOverlay: [] }>();

const { subscribedTags, popularTags, loadSubscriptions, loadPopularTags, subscribe, unsubscribe } =
  useTags();
const { setTag } = useFeed();

const pendingTagId = ref<string | null>(null);

function handleTagClick(tagName: string): void {
  setTag(tagName);
}

async function handleSubscribe(tag: Tag): Promise<void> {
  pendingTagId.value = tag.id;
  try {
    await subscribe(tag);
  } finally {
    pendingTagId.value = null;
  }
}

async function handleUnsubscribe(tagId: string): Promise<void> {
  pendingTagId.value = tagId;
  try {
    await unsubscribe(tagId);
  } finally {
    pendingTagId.value = null;
  }
}

onMounted(() => {
  void loadSubscriptions();
  void loadPopularTags(10);
});

// Simple SVG icon components
const HomeIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1',
    }),
  ]);
const TrendingIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6',
    }),
  ]);
const SnippetsIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
    }),
  ]);
const BookmarkIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
    }),
  ]);
const FollowingIcon: FunctionalComponent = () =>
  h('svg', { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor' }, [
    h('path', {
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'stroke-width': '2',
      d: 'M5 13l4 4L19 7',
    }),
  ]);

const navLinks = [
  { to: '/', label: 'Home', icon: HomeIcon, testid: 'home-nav-link' },
  { to: '/trending', label: 'Trending', icon: TrendingIcon, testid: 'trending-nav-link' },
  { to: '/my-snippets', label: 'My Snippets', icon: SnippetsIcon, testid: 'my-snippets-nav-link' },
  { to: '/bookmarks', label: 'Bookmarks', icon: BookmarkIcon, testid: 'bookmarks-nav-link' },
  { to: '/following', label: 'Following', icon: FollowingIcon, testid: 'following-nav-link' },
];
</script>

<style scoped>
.sidebar-enter-active,
.sidebar-leave-active {
  transition:
    opacity 0.2s,
    transform 0.2s;
}
.sidebar-enter-from,
.sidebar-leave-to {
  opacity: 0;
}
.sidebar-enter-from aside,
.sidebar-leave-to aside {
  transform: translateX(-100%);
}
</style>
