<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <!-- Loading state -->
    <div v-if="loading" data-testid="loading" class="flex items-center justify-center py-20">
      <div class="h-8 w-8 animate-spin rounded-full border-2 border-gray-600 border-t-primary" />
    </div>

    <!-- Error state -->
    <div
      v-else-if="error"
      data-testid="error"
      class="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center"
    >
      <p class="text-red-400">
        {{ error }}
      </p>
    </div>

    <!-- Profile content -->
    <template v-else-if="profile">
      <!-- Header: avatar + name + join date -->
      <div class="flex items-center gap-6">
        <!-- Avatar -->
        <img
          v-if="profile.user.avatarUrl"
          data-testid="avatar-img"
          :src="profile.user.avatarUrl"
          :alt="profile.user.displayName"
          class="h-20 w-20 rounded-full object-cover"
        />
        <div
          v-else
          data-testid="avatar-fallback"
          class="flex h-20 w-20 items-center justify-center rounded-full bg-primary text-2xl font-bold text-white"
        >
          {{ profile.user.displayName.charAt(0).toUpperCase() }}
        </div>

        <div>
          <h1 class="text-2xl font-bold text-white">
            {{ profile.user.displayName }}
          </h1>
          <p class="text-sm text-gray-400">Joined {{ formatDate(profile.user.createdAt) }}</p>
        </div>
      </div>

      <!-- Badges -->
      <div v-if="profile.badges.length > 0" class="mt-4 flex flex-wrap gap-2">
        <UserBadge v-for="(badge, index) in profile.badges" :key="index" :badge="badge" />
      </div>

      <!-- Stats -->
      <div class="mt-6">
        <UserStats :stats="profile.stats" />
      </div>

      <!-- Posts section -->
      <div class="mt-8">
        <h2 class="mb-4 text-lg font-semibold text-white">Posts</h2>

        <!-- Empty posts state -->
        <div
          v-if="profile.posts.length === 0"
          data-testid="empty-posts"
          class="rounded-lg border border-gray-700 bg-gray-800 p-6 text-center text-gray-400"
        >
          No posts yet.
        </div>

        <!-- Post list -->
        <div v-else class="space-y-3">
          <RouterLink
            v-for="post in profile.posts"
            :key="post.id"
            :to="{ name: 'post-view', params: { id: post.id } }"
            data-testid="post-link"
            class="block rounded-lg border border-gray-700 bg-gray-800 p-4 transition-colors hover:border-gray-600"
          >
            <div class="flex items-start justify-between">
              <div>
                <h3 class="font-medium text-white">
                  {{ post.title }}
                </h3>
                <div class="mt-1 flex items-center gap-3 text-sm text-gray-400">
                  <span>{{ post.contentType }}</span>
                  <span v-if="post.language">{{ post.language }}</span>
                  <span>{{ timeAgo(post.createdAt) }}</span>
                </div>
                <div v-if="post.tags.length > 0" class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="tag in post.tags"
                    :key="tag"
                    class="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
              <span class="text-sm text-gray-400">{{ post.voteCount }} votes</span>
            </div>
          </RouterLink>
        </div>

        <!-- Load more button -->
        <div v-if="profile.cursor" class="mt-4 flex justify-center">
          <button
            data-testid="load-more"
            class="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-600 hover:text-white"
            @click="loadMore"
          >
            Load more
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { watch } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import { useUserProfile } from '../composables/useUserProfile.js';
import UserBadge from '../components/user/UserBadge.vue';
import UserStats from '../components/user/UserStats.vue';

const route = useRoute();
const { profile, loading, error, fetchProfile, loadMore } = useUserProfile();

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function timeAgo(date: Date | string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

watch(
  () => route.params.id as string,
  (id) => {
    if (id) {
      fetchProfile(id);
    }
  },
  { immediate: true },
);
</script>
