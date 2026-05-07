<template>
  <nav
    v-if="items.length > 1"
    data-testid="breadcrumbs"
    aria-label="Breadcrumb"
    class="flex items-center gap-1 px-4 py-2 text-xs text-gray-400"
  >
    <ol class="flex items-center gap-1">
      <li v-for="(item, idx) in items" :key="idx" class="flex items-center gap-1">
        <RouterLink
          v-if="item.to !== null && idx < items.length - 1"
          :to="item.to"
          :data-testid="`breadcrumb-link-${idx}`"
          class="hover:text-white"
        >
          {{ item.label }}
        </RouterLink>
        <span
          v-else
          :data-testid="idx === items.length - 1 ? 'breadcrumb-current' : `breadcrumb-${idx}`"
          class="text-gray-300"
          :aria-current="idx === items.length - 1 ? 'page' : undefined"
        >
          {{ item.label }}
        </span>
        <span v-if="idx < items.length - 1" class="text-gray-600">/</span>
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import { RouterLink, type RouteLocationRaw } from 'vue-router';

interface BreadcrumbItem {
  label: string;
  to: RouteLocationRaw | null;
}

defineProps<{ items: BreadcrumbItem[] }>();
</script>
