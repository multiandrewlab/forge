# App Shell & Feed UI Design

**Issue:** #17 — [5/19] App shell & feed UI
**Date:** 2026-04-12
**Status:** Draft

## Overview

Three-panel layout (sidebar + post list + detail panel) with dark mode, feed sorting, cursor-based pagination, and responsive breakpoints. This is the primary navigation shell that wraps all authenticated routes.

## Design Decisions

| Decision                     | Choice                                                | Rationale                                                         |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Sidebar responsive behavior  | Hybrid: icon rail on tablet, overlay drawer on mobile | Optimal UX at every breakpoint                                    |
| List/detail on small screens | Route-based navigation                                | Simple mental model, browser back/forward works naturally         |
| Pagination                   | "Load more" button                                    | Simpler than infinite scroll, easy scroll restoration             |
| Empty detail state           | Auto-select first post                                | App feels populated immediately, no wasted space                  |
| Data architecture            | Hybrid: thin Pinia store + composable                 | Matches existing useAuth/authStore pattern                        |
| Routing structure            | Nested layout-children routes (flat → nested)         | Layouts own their route trees; cleaner than per-route layout meta |

## Component Architecture

### Layout Structure

```
┌──────────────────────────────────────────────────────┐
│  TheTopBar: Logo "Knowledge Hub", Search placeholder  │
├────────────┬─────────────────────────────────────────┤
│ TheSidebar │  <router-view>                          │
│  (240px)   │  ┌──────────────┬─────────────────────┐ │
│            │  │  PostList     │  PostDetail          │ │
│  Create    │  │  (360px)     │  (flex-1)            │ │
│  New Post  │  │  Sort tabs   │  CodeViewer           │
│  ─────     │  │  Items...    │  PostMetaHeader       │
│  Home      │  │  Load More   │  PostActions          │
│  Trending  │  │              │                      │ │
│  My Snips  │  └──────────────┴─────────────────────┘ │
│  Bookmarks │                                         │
│  ─────     │                                         │
│  TAGS      │                                         │
│  ─────     │                                         │
│  UserAvatar│                                         │
└────────────┴─────────────────────────────────────────┘
```

### New Components

| Component             | Location            | Responsibility                                                                                                                 |
| --------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `AppLayout.vue`       | `layouts/`          | 3-panel shell, responsive breakpoint logic                                                                                     |
| `AuthLayout.vue`      | `layouts/`          | Centered auth card for login/register                                                                                          |
| `TheSidebar.vue`      | `components/shell/` | Nav links, create button, tags, user avatar, collapse states                                                                   |
| `TheTopBar.vue`       | `components/shell/` | Logo, search input placeholder, dark mode toggle                                                                               |
| `UserAvatar.vue`      | `components/shell/` | Avatar circle + dropdown menu                                                                                                  |
| `PostList.vue`        | `components/post/`  | Sort tabs, scrollable list, "Load more" button                                                                                 |
| `PostListItem.vue`    | `components/post/`  | Title, excerpt, author avatar + name, timestamp, votes, content type icon, draft badge (when filter=mine)                      |
| `PostListFilters.vue` | `components/post/`  | Sort tab bar (Trending/Recent/Top)                                                                                             |
| `PostDetail.vue`      | `components/post/`  | Orchestrates CodeViewer + PostMetaHeader + PostActions + comments placeholder                                                  |
| `PostActions.vue`     | `components/post/`  | Vote buttons, bookmark toggle, share — stateless stub (no store bindings), renders disabled UI. Functional wiring in issue #18 |
| `PostMetaHeader.vue`  | `components/post/`  | Author info, updated-ago, tag chips                                                                                            |

### Responsive Breakpoints

| Breakpoint        | Sidebar                                        | Post List + Detail                          | Behavior            |
| ----------------- | ---------------------------------------------- | ------------------------------------------- | ------------------- |
| Desktop >1024px   | Full 240px (manually collapsible to icon rail) | Side-by-side: list 360px, detail flex-1     | Full 3-panel layout |
| Tablet 768–1024px | Icon rail 56px                                 | Side-by-side: list 300px, detail flex-1     | Compact sidebar     |
| Mobile <768px     | Hidden, overlay drawer via hamburger           | Route-based: list OR detail (one at a time) | Single panel        |

## Data Flow & State Management

### Stores

**`useFeedStore`** — thin state container:

```typescript
interface FeedState {
  posts: Post[];
  sort: 'trending' | 'recent' | 'top';
  selectedPostId: string | null;
  cursor: string | null;
  hasMore: boolean;
  tag: string | null;
  filter: 'mine' | 'bookmarked' | null;
  contentType: 'snippet' | 'prompt' | 'document' | 'link' | null;
}
```

**`useUiStore`** — UI-only state:

```typescript
interface UiState {
  sidebarCollapsed: boolean;
  searchModalOpen: boolean; // wired to false for now, functional in issue #9
  darkMode: boolean;
}
```

### Composables

**`useFeed()`** — wraps feedStore + apiFetch:

- `loadPosts()` — fetches first page, replaces store posts
- `loadMore()` — fetches next page using cursor, appends to store posts
- `setSort(sort)` — updates store sort, reloads posts
- `setFilter(filter)` — updates store filter, reloads posts
- `setContentType(type)` — updates store contentType, reloads posts
- `selectPost(id)` — sets selectedPostId
- Computed `selectedPost` derived from posts + selectedPostId
- Auto-selects first post after initial load (desktop/tablet only — on mobile <768px, auto-select is a no-op since detail is route-based)
- Watches route props (`sort`, `filter`) reactively — when the route changes between `/`, `/trending`, `/my-snippets`, `/bookmarks`, the composable reloads posts. Vue Router reuses the `HomePage` component instance across these routes (same component, different props), so a `watch()` on the props drives the reload rather than relying on mount.

**`useDarkMode()`** — wraps useUiStore.darkMode:

- Init priority: localStorage('forge-theme') → system preference → default dark
- Toggles `dark` class on `<html>` element (Tailwind `darkMode: 'class'` strategy)
- Persists to localStorage on every toggle

### Data Flow Example

```
User clicks "Trending" tab
  → PostListFilters emits @sort="trending"
  → PostList calls useFeed().setSort('trending')
  → useFeed updates feedStore.sort, calls GET /api/posts?sort=trending
  → feedStore.posts replaced with response
  → PostList re-renders, auto-selects first post
  → PostDetail shows selected post
```

## Server API

### `GET /api/posts` (new feed endpoint)

**Query parameters:**

| Param    | Type                              | Default  | Description                               |
| -------- | --------------------------------- | -------- | ----------------------------------------- |
| `sort`   | `trending\|recent\|top`           | `recent` | Sort algorithm                            |
| `filter` | `mine\|bookmarked`                | —        | User-specific filter                      |
| `tag`    | `string`                          | —        | Filter by tag name                        |
| `type`   | `snippet\|prompt\|document\|link` | —        | Filter by content type                    |
| `cursor` | `string`                          | —        | Opaque pagination cursor (base64-encoded) |
| `limit`  | `number`                          | 20       | Posts per page                            |

**Response:**

```typescript
{
  posts: PostWithAuthor[]   // includes is_draft field (relevant when filter=mine)
  cursor: string | null     // null = no more pages
  hasMore: boolean
}
```

**Sort SQL:**

```sql
-- trending: time-decay weighted by votes
ORDER BY (vote_count::float / POWER(EXTRACT(EPOCH FROM NOW() - created_at) / 3600 + 2, 1.5)) DESC

-- recent: newest first
ORDER BY created_at DESC

-- top: highest votes
ORDER BY vote_count DESC, created_at DESC
```

**Cursor-based pagination:** Cursor encodes `(sort_value, id)` as a base64 string. Server decodes to build `WHERE sort_value < $cursor_value OR (sort_value = $cursor_value AND id < $cursor_id)` clause. Avoids offset skipping and handles new posts appearing during browsing.

**Trending sort cursor note:** The trending score is a computed float derived from `NOW()` which shifts every second. To avoid cursor instability, trending pagination uses `created_at` as the stable sort key (not the computed score). The trending score is only used for ORDER BY on the initial page; subsequent pages use `WHERE created_at < $cursor_created_at` to maintain stable keyset pagination. This means pages fetched later may have slight ordering drift, which is acceptable for a feed.

**Filters:**

- `mine`: `WHERE author_id = $currentUserId`
- `bookmarked`: `JOIN bookmarks ON bookmarks.post_id = posts.id WHERE bookmarks.user_id = $currentUserId`
- `tag`: `JOIN post_tags pt ON pt.post_id = posts.id JOIN tags t ON t.id = pt.tag_id WHERE t.name = $tag`
- `type`: `WHERE posts.content_type = $type`

**Constraints:**

- Only returns published posts (`is_draft = false`) unless `filter=mine` (which includes drafts with `is_draft` in the response so the UI can render a "Draft" badge)
- Soft-delete filter: `deleted_at IS NULL`
- Authenticated endpoint (`app.authenticate` preHandler)

## Routing

Routes restructured as children of layout components:

```typescript
const routes = [
  {
    path: '/',
    component: AppLayout,
    meta: { requiresAuth: true },
    children: [
      { path: '', component: HomePage },
      { path: 'trending', component: HomePage, props: { sort: 'trending' } },
      { path: 'my-snippets', component: HomePage, props: { filter: 'mine' } },
      { path: 'bookmarks', component: HomePage, props: { filter: 'bookmarked' } },
      { path: 'post/new', component: PostNewPage },
      { path: 'post/:id', component: PostViewPage },
      { path: 'post/:id/edit', component: PostEditPage },
      { path: 'post/:id/history', component: PostHistoryPage },
    ],
  },
  {
    path: '/login',
    component: AuthLayout,
    meta: { guest: true },
    children: [
      { path: '', component: LoginPage },
      { path: 'register', component: RegisterPage }, // relative path so AuthLayout wraps it → /login/register
    ],
  },
];
```

`HomePage` renders `PostList` + `PostDetail` side-by-side on desktop. On mobile (<768px), `HomePage` renders only `PostList`; clicking a post navigates to `/post/:id` which renders `PostViewPage` full-screen within `AppLayout`.

## Dark Mode

- Default: dark (matches existing `#1e1e2e` surface theme)
- Toggle button: sun/moon icon in `TheTopBar`
- Init: localStorage → system preference → dark fallback
- Mechanism: `dark` class on `<html>` (Tailwind v4 `@custom-variant dark`)
- Persistence: `localStorage('forge-theme')` updated on every toggle

## Sidebar States

### Full State (desktop >1024px, 240px)

1. "Create New Post" button (primary orange)
2. Nav links with icons: Home, Trending, My Snippets, Bookmarks
3. Divider
4. "Followed Tags" section with tag chips (static list for now — interactive in issue #18)
5. Divider
6. User avatar + display name → click opens dropdown (Profile, My Snippets, Settings, Logout)

### Icon Rail State (tablet 768–1024px, 56px)

- Same items as icons only, no labels
- Tooltip labels on hover
- User avatar becomes circle only
- "Create New Post" becomes `+` icon

### Overlay State (mobile <768px)

- Full sidebar content slides in from left
- Semi-transparent backdrop covers main content
- Clicking backdrop or nav link closes overlay
- Hamburger button in TheTopBar triggers open

### Manual Collapse (desktop)

- Users can manually collapse full sidebar to icon rail on desktop
- `useUiStore.sidebarCollapsed` persisted to `localStorage('forge-sidebar-collapsed')`
- Responsive behavior is CSS-driven via Tailwind breakpoints (no JS breakpoint detection)
- Overlay open/close state is local to TheSidebar.vue (transient, not in store)

## File Scope

### New Files

- `packages/client/src/layouts/AppLayout.vue`
- `packages/client/src/layouts/AuthLayout.vue`
- `packages/client/src/components/shell/TheSidebar.vue`
- `packages/client/src/components/shell/TheTopBar.vue`
- `packages/client/src/components/shell/UserAvatar.vue`
- `packages/client/src/components/post/PostList.vue`
- `packages/client/src/components/post/PostListItem.vue`
- `packages/client/src/components/post/PostListFilters.vue`
- `packages/client/src/components/post/PostDetail.vue`
- `packages/client/src/components/post/PostMetaHeader.vue`
- `packages/client/src/components/post/PostActions.vue`
- `packages/client/src/composables/useDarkMode.ts`
- `packages/client/src/composables/useFeed.ts`
- `packages/client/src/stores/feed.ts`
- `packages/client/src/stores/ui.ts`

### Modified Files

- `packages/client/src/plugins/router.ts` — restructure routes as layout children
- `packages/client/src/pages/HomePage.vue` — replace placeholder with PostList + PostDetail
- `packages/server/src/routes/posts.ts` — add GET /api/posts feed endpoint
- `packages/server/src/db/queries/posts.ts` — add feed query with sort/filter/pagination

## Definition of Done

- [ ] Three-panel layout renders matching the spec layout diagram
- [ ] Dark mode toggles correctly (default dark, persists to localStorage)
- [ ] Sidebar navigation works (all routes: Home, Trending, My Snippets, Bookmarks)
- [ ] Sidebar responsive: full on desktop, icon rail on tablet, overlay on mobile
- [ ] Feed shows posts with correct sort options (trending/recent/top)
- [ ] Selecting a post shows detail panel with code viewer + metadata
- [ ] Auto-selects first post on initial load
- [ ] "Load more" pagination works with cursor-based API
- [ ] "Create New Post" button navigates to editor
- [ ] User avatar dropdown works (Profile, My Snippets, Settings, Logout)
- [ ] GET /api/posts endpoint supports sort, filter, tag, type, cursor, limit params
- [ ] PostDetail includes comments placeholder area (stub — functional in issue #19)
- [ ] PostActions stub renders (vote buttons, bookmark — functional in issue #18)
- [ ] Mobile: route-based list↔detail navigation works
- [ ] filter=mine shows drafts with "Draft" badge on PostListItem
