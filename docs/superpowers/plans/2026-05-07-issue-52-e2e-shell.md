# Issue #52 — E2E shell + accessibility — Implementation Plan (Path B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Per CLAUDE.md the user always picks the execution method — they have already chosen subagent-driven; do NOT switch.**

**User authorization for scope expansion**: 2026-05-07 — user explicitly opted into Path B (scope expansion to include building the missing client surfaces inside #52). This authorizes modifications outside the issue's stated File Scope (`lib/`, `plugins/`, `stores/`, `components/feedback/`, `pages/PostViewPage.vue`).

**Goal:** Ship a 12-spec Playwright suite under `e2e/specs/shell/` covering top nav, sidebar nav, dark-mode persistence, keyboard shortcuts (Cmd+K, n, /, ?), error toast on 5xx, error boundary on render-fail, 404 page, 401-redirects-to-login, breadcrumbs, and mobile responsive smoke — all stable at workers=1 AND workers=4. Build the 5 net-new client features the DoD assumes exist.

**Architecture:** Two work streams.

1. **Client surface work (Phase A)** — build the 5 missing shell features (error toast, error boundary, 404 page, keyboard-shortcuts `n`/`/`/`?` + help modal, breadcrumbs), convert the `<span>Forge</span>` logo into a `<RouterLink>`, add `data-testid` hooks across shell components, populate `e2e/fixtures/network-faults.ts`, and consolidate `e2e/fixtures/selectors/shell.ts`. Each new client feature ships with Vitest unit coverage hitting the 100% thresholds in `.coverage-thresholds.json`.
2. **Spec authoring (Phase B)** — one spec file per DoD scenario, all rooted at the per-worker `actor` fixture and the canonical reset/init-script fixtures.

**Tech Stack:** Playwright 1.x (test, expect, AxeBuilder, page.route, page.keyboard, context.clearCookies, page.setViewportSize), Vue 3 (`onErrorCaptured`, RouterLink, Teleport), Pinia (toast store), `useKeyboard` composable, `localStorage('forge-theme')` for dark-mode persistence, vue-router catch-all for 404, `@axe-core/playwright`.

---

## Pre-implementation: file scope

```
e2e/specs/shell/                                            (NEW — 10 spec files; some contain 2–4 test cases)
e2e/fixtures/selectors/shell.ts                             (MODIFY — final consolidation)
e2e/fixtures/network-faults.ts                              (MODIFY — populate api500 / apiInvalidJson / apiNetworkError exports)
packages/client/src/components/shell/TheTopBar.vue          (MODIFY — testids on logo, dark-mode-toggle, sidebar-toggle, header; logo→RouterLink; register `/`)
packages/client/src/components/shell/TheSidebar.vue         (MODIFY — testids on desktop sidebar + mobile-drawer)
packages/client/src/components/shell/TheSearchModal.vue     (MODIFY — testid on dialog wrapper)
packages/client/src/components/shell/UserAvatar.vue         (no changes — existing user-menu-trigger and per-action testids preserved)
packages/client/src/components/shell/KeyboardShortcutsHelp.vue   (NEW — `?` shortcut help modal)
packages/client/src/components/feedback/ErrorToast.vue      (NEW — global toast UI)
packages/client/src/components/feedback/ErrorBoundary.vue   (NEW — Vue 3 onErrorCaptured wrapper)
packages/client/src/components/feedback/Breadcrumbs.vue     (NEW — generic breadcrumb component)
packages/client/src/pages/NotFoundPage.vue                  (NEW — catch-all 404 page)
packages/client/src/stores/toast.ts                         (NEW — Pinia store for queued toasts)
packages/client/src/lib/api.ts                              (MODIFY — emit toast on 5xx)
packages/client/src/plugins/router.ts                       (MODIFY — catch-all `:pathMatch(.*)*` route to NotFoundPage)
packages/client/src/layouts/AppLayout.vue                   (MODIFY — testid on app-layout root, mount ErrorToast + ErrorBoundary + KeyboardShortcutsHelp, register `n` and `?`)
packages/client/src/pages/PostViewPage.vue                  (MODIFY — render Breadcrumbs)
packages/client/src/__tests__/stores/toast.test.ts                                      (NEW)
packages/client/src/__tests__/components/feedback/ErrorToast.test.ts                    (NEW)
packages/client/src/__tests__/components/feedback/ErrorBoundary.test.ts                 (NEW)
packages/client/src/__tests__/components/feedback/Breadcrumbs.test.ts                   (NEW)
packages/client/src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts            (NEW)
packages/client/src/__tests__/pages/NotFoundPage.test.ts                                (NEW)
packages/client/src/__tests__/lib/api.test.ts                                           (MODIFY/NEW — cover 5xx toast push)
packages/client/src/__tests__/plugins/router.test.ts                                    (MODIFY — cover catch-all route)
packages/client/src/__tests__/components/shell/TheTopBar.test.ts                        (MODIFY — cover logo RouterLink, new shortcut registrations, new testids)
packages/client/src/__tests__/components/shell/TheSidebar.test.ts                       (MODIFY if existing tests break)
packages/client/src/__tests__/layouts/AppLayout.test.ts                                 (MODIFY — cover ErrorToast/ErrorBoundary mount + new keyboard registrations)
packages/client/src/__tests__/pages/PostViewPage.test.ts                                (MODIFY — cover Breadcrumbs render, if file exists)
.beads/plans/active-plan.md                                                             (REPLACE — point to this plan)
```

**Out of scope:** server changes, new API endpoints (no Bruno additions), MinIO/S3, AI/LLM, file-upload UI, search backend, profile/settings pages (still TODOs in `UserAvatar.vue:58,60`), tag pages, post-history page, playground page.

**Spec count.** 10 spec files, 16 test cases. Within the issue's 10–14 target.

**Authorized scope-expansion modifications.** The user explicitly authorized the following modifications outside the issue's stated File Scope:

- `packages/client/src/lib/api.ts` — cross-cutting 5xx → toast wiring (every 5xx response anywhere in the app now triggers a toast).
- `packages/client/src/plugins/router.ts` — adds catch-all 404 route.
- `packages/client/src/stores/toast.ts` — new Pinia store.
- `packages/client/src/components/feedback/**` — three new components (ErrorToast, ErrorBoundary, Breadcrumbs).
- `packages/client/src/pages/NotFoundPage.vue` — new page.
- `packages/client/src/pages/PostViewPage.vue` — adds Breadcrumbs render at the top of the page.
- `packages/client/src/components/shell/KeyboardShortcutsHelp.vue` — new component.
- Logo `<span>` → `<RouterLink to="/">` conversion in `TheTopBar.vue`.

---

## Pre-implementation gotchas (must read before Task 1)

- **Dark-mode persistence rides on `localStorage('forge-theme')`.** `useDarkMode.ts:8` reads it on mount and `useDarkMode.ts:34` writes it on toggle. Playwright's `BrowserContext.storageState()` captures `origins[].localStorage` automatically. To verify a saved value across navigation, read `localStorage.getItem('forge-theme')` via `actor.evaluate(() => localStorage.getItem('forge-theme'))`.
- **The dark class lives on `<html>`, not `<body>`.** Assertions must use `document.documentElement.classList.contains('dark')` via `page.evaluate`, NOT a Tailwind utility-class probe on `body`.
- **Keyboard registry is module-scoped and singleton.** `useKeyboard.ts:7` declares `const registry = new Map<...>` at module scope. Multiple components calling `register()` add to a `Set<Handler>`, not replacing. AppLayout MUST register `n` (new post nav) and `?` (open help) at the layout level. `/` MUST be registered at TheTopBar (it opens the search modal — same composition style as existing `mod+k`).
- **Mac vs Linux modifier branching.** `useKeyboard.ts:38-48` handles Mac (`metaKey`) vs others (`ctrlKey`) automatically — specs do NOT need `process.platform` branching when relying on the composable. BUT: when a spec calls `page.keyboard.press('Meta+K')` directly, prefer the platform branch for end-to-end realism on Linux CI: `process.platform === 'darwin' ? 'Meta+K' : 'Control+K'`.
- **The "Forge" logo is a `<span>`, not a link.** `TheTopBar.vue:19` is `<span class="text-lg font-bold text-primary">Forge</span>`. Task 6 converts this to a `<RouterLink to="/" data-testid="logo-link">` so the spec for "logo click → home" works.
- **Sidebar-toggle button is mobile-only.** `TheTopBar.vue:5` has `class="text-gray-400 hover:text-white lg:hidden"` — only renders below the `lg` breakpoint (1024px). At default desktop viewport (1280×720), the button is hidden. Mobile-drawer specs MUST `await actor.setViewportSize({ width: 375, height: 812 })` BEFORE asserting the toggle is visible.
- **The mobile drawer is a `<Teleport to="body">`.** `TheSidebar.vue:96-156` mounts the overlay outside the `<aside>` tree. Task 6 adds `data-testid="mobile-nav-drawer"` to the inner `<aside>` inside the `<Transition>`.
- **Search modal is in DOM only when `searchStore.isOpen`.** `TheSearchModal.vue:3` uses `v-if="searchStore.isOpen"`. Specs that assert the modal is closed should use `expect(modal).toBeHidden()` (Playwright treats not-in-DOM as hidden).
- **401 path triggers token-refresh first.** `lib/api.ts:65` only fails through to a redirect when BOTH the access token has been cleared AND the refresh-token cookie is missing/invalid. Reliable pattern: `await actor.context().clearCookies()` + `await actor.evaluate(() => localStorage.clear())` + `await actor.goto('/')` → next nav (a full reload via `goto`) re-runs the bootstrap session-restore, which fails (no refresh-token cookie), the route guard fires, and the user lands on `/login?redirect=/`.
- **`apiFetch` 5xx detection is centralized.** Task 1 wires the error toast in `lib/api.ts` after the existing 401-refresh block. Three return paths exist (`return response` at line 67 for non-401, `return response` at line 74 for refresh-failed, and `return fetch(...)` at line 81 for the retry). The plan factors a `maybePushServerError` helper so all three paths emit the toast on `>= 500`.
- **Vue 3 `onErrorCaptured` catches synchronous errors thrown during a descendant's `setup()`.** Async errors thrown after mount may not be caught unless re-thrown synchronously. The boundary spec uses an init-script-injected synchronous render bomb to make the boundary fire reliably (Task 14). The Vitest test (Task 2) uses a setup-throw, which is canonical.
- **Route catch-all syntax (Vue Router 4).** `{ path: ':pathMatch(.*)*', name: 'not-found', component: NotFoundPage, meta: { requiresAuth: false } }`. Inside the AppLayout's `children` array, the path is relative — `(.*)` matches any unknown URL. `meta.requiresAuth: false` allows unauthenticated users to land on 404 without a `/login` redirect.
- **`actor` is per-worker.** One of `e2e_w0..e2e_w3` per `testInfo.parallelIndex`. Never reach for `testuser`. The CI lint guard at `.github/workflows/e2e-playwright.yml` fails if any spec under `e2e/specs/` matches `testuser@example.com`, `storageStatePath('testuser')`, or `SEED_USERS.testuser`.
- **`actor` provides per-test BrowserContext.** `e2e/fixtures/auth.ts:46-58` creates `browser.newContext({...})` per test and closes it after each. `clearCookies` / `localStorage.clear` cannot leak across tests.
- **Coverage gates.** `.coverage-thresholds.json` is the single source of truth. New components in `packages/client/src/components/feedback/`, `packages/client/src/pages/NotFoundPage.vue`, `packages/client/src/components/shell/KeyboardShortcutsHelp.vue`, `packages/client/src/stores/toast.ts` MUST hit 100% lines/branches/functions/statements. Coverage runs in Task 21 as a blocking gate.
- **Bruno gate is unaffected.** This issue introduces zero new server endpoints, so no `.bru` files are added.
- **No `--no-verify` on commits, no force-push.** Per CLAUDE.md "Subagent Discipline".
- **Subagent-driven execution chosen.** Each task dispatches a fresh subagent. Subagents must:
  - Stay within the declared file scope of their assigned task
  - Follow TDD strictly (write tests first, run red, implement, run green)
  - Commit at the end of every task
  - NEVER use `--no-verify` or `git push --force`
  - NEVER self-certify — the orchestrator validates between tasks

---

## Pre-implementation order rationale

Why Phase A (client features) before Phase B (specs):

1. Specs cannot run against features that don't exist. Writing `await expect(errorToast).toBeVisible()` before there IS an error-toast in the DOM produces specs that aren't truly red.
2. The unit-test phase catches the design choices early (toast queueing, dismiss timing, ARIA roles) so the spec assertions are stable.
3. Each Phase A task ends with a commit; Phase B specs reference exact testids that landed in Phase A.

---

## Phase A — Client surface work

### Task 1: Toast store + ErrorToast component + global 5xx wiring

**Files:**

- Create: `packages/client/src/stores/toast.ts`
- Create: `packages/client/src/components/feedback/ErrorToast.vue`
- Create: `packages/client/src/__tests__/stores/toast.test.ts`
- Create: `packages/client/src/__tests__/components/feedback/ErrorToast.test.ts`
- Modify: `packages/client/src/lib/api.ts` (add 5xx → toast)
- Modify: `packages/client/src/__tests__/lib/api.test.ts` (cover 5xx push)
- Modify: `packages/client/src/layouts/AppLayout.vue` (mount `<ErrorToast>`, add root testid)

- [ ] **Step 1: Write failing test for the toast store**

```ts
// packages/client/src/__tests__/stores/toast.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useToastStore } from '@/stores/toast';

describe('toast store', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('starts with empty queue', () => {
    const store = useToastStore();
    expect(store.toasts).toEqual([]);
  });

  it('push appends a toast with auto-generated id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]?.kind).toBe('error');
    expect(store.toasts[0]?.message).toBe('Boom');
    expect(typeof store.toasts[0]?.id).toBe('string');
  });

  it('dismiss removes by id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'A' });
    store.push({ kind: 'error', message: 'B' });
    const idA = store.toasts[0]!.id;
    store.dismiss(idA);
    expect(store.toasts).toHaveLength(1);
    expect(store.toasts[0]?.message).toBe('B');
  });

  it('dismiss is no-op for unknown id', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'A' });
    store.dismiss('does-not-exist');
    expect(store.toasts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/stores/toast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the toast store**

```ts
// packages/client/src/stores/toast.ts
import { ref } from 'vue';
import { defineStore } from 'pinia';

export type ToastKind = 'error' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
}

let counter = 0;
function generateId(): string {
  counter += 1;
  return `toast-${Date.now()}-${counter}`;
}

export const useToastStore = defineStore('toast', () => {
  const toasts = ref<Toast[]>([]);

  function push(input: Omit<Toast, 'id'>): void {
    toasts.value.push({ id: generateId(), ...input });
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  }

  return { toasts, push, dismiss };
});
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/stores/toast.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write failing test for `ErrorToast.vue`**

```ts
// packages/client/src/__tests__/components/feedback/ErrorToast.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ErrorToast from '@/components/feedback/ErrorToast.vue';
import { useToastStore } from '@/stores/toast';

describe('ErrorToast', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders nothing when queue empty', () => {
    const wrapper = mount(ErrorToast);
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });

  it('renders one toast per queued entry', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'First failure' });
    store.push({ kind: 'error', message: 'Second failure' });
    const wrapper = mount(ErrorToast);
    const items = wrapper.findAll('[data-testid="error-toast"]');
    expect(items).toHaveLength(2);
    expect(items[0]!.text()).toContain('First failure');
    expect(items[1]!.text()).toContain('Second failure');
  });

  it('dismiss button removes the toast from the store', async () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    const wrapper = mount(ErrorToast);
    await wrapper.find('[data-testid="error-toast-dismiss"]').trigger('click');
    expect(store.toasts).toHaveLength(0);
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });

  it('marks toasts with role=status for assistive tech', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    const wrapper = mount(ErrorToast);
    const node = wrapper.find('[data-testid="error-toast"]');
    expect(node.attributes('role')).toBe('status');
    expect(node.attributes('aria-live')).toBe('polite');
  });
});
```

- [ ] **Step 6: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/ErrorToast.test.ts`
Expected: FAIL.

- [ ] **Step 7: Implement `ErrorToast.vue`**

```vue
<!-- packages/client/src/components/feedback/ErrorToast.vue -->
<template>
  <div
    v-if="toastStore.toasts.length > 0"
    data-testid="error-toast-stack"
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
  >
    <div
      v-for="t in toastStore.toasts"
      :key="t.id"
      data-testid="error-toast"
      role="status"
      aria-live="polite"
      class="flex items-center gap-3 rounded-lg border border-red-700 bg-red-900 px-4 py-2 text-sm text-red-100 shadow-lg"
    >
      <span class="flex-1">{{ t.message }}</span>
      <button
        data-testid="error-toast-dismiss"
        :aria-label="`Dismiss: ${t.message}`"
        class="text-red-200 hover:text-white"
        @click="toastStore.dismiss(t.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast';

const toastStore = useToastStore();
</script>
```

- [ ] **Step 8: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/ErrorToast.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 9: Modify `apiFetch` to push toasts on 5xx**

In `packages/client/src/lib/api.ts`:

1. Add import at top:

```ts
import { useToastStore } from '@/stores/toast';
```

2. Add helper function above `apiFetch`:

```ts
function maybePushServerError(response: Response): void {
  if (response.status >= 500) {
    const toastStore = useToastStore();
    toastStore.push({ kind: 'error', message: 'Something went wrong. Please try again.' });
  }
}
```

3. Call `maybePushServerError(response)` immediately before EACH `return response` statement (three sites: line 67 the non-401-skip, line 74 the refresh-failed return, line 81 the retry-fetch return).

For the retry path (`return fetch(url, {...})`), restructure to:

```ts
const retryResponse = await fetch(url, { ...options, headers: retryHeaders });
maybePushServerError(retryResponse);
return retryResponse;
```

- [ ] **Step 10: Add Vitest coverage for the api 5xx path**

Append to `packages/client/src/__tests__/lib/api.test.ts` (create the file if it doesn't exist; check first with `ls packages/client/src/__tests__/lib/api.test.ts`):

```ts
// inside an existing/new describe('apiFetch')
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { apiFetch } from '@/lib/api';
import { useToastStore } from '@/stores/toast';

describe('apiFetch — 5xx behavior', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('pushes an error toast when the server returns 500', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('boom', { status: 500 }));
    await apiFetch('/api/whatever');
    const toastStore = useToastStore();
    expect(toastStore.toasts).toHaveLength(1);
    expect(toastStore.toasts[0]?.kind).toBe('error');
    fetchSpy.mockRestore();
  });

  it('does not push a toast on 200 responses', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    await apiFetch('/api/whatever');
    const toastStore = useToastStore();
    expect(toastStore.toasts).toHaveLength(0);
    fetchSpy.mockRestore();
  });

  it('does not push a toast on 4xx responses', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));
    await apiFetch('/api/whatever');
    const toastStore = useToastStore();
    expect(toastStore.toasts).toHaveLength(0);
    fetchSpy.mockRestore();
  });
});
```

If `api.test.ts` doesn't exist, create it with the boilerplate from existing test files in `packages/client/src/__tests__/lib/`.

- [ ] **Step 11: Mount `<ErrorToast>` in `AppLayout.vue` + add root testid**

In `packages/client/src/layouts/AppLayout.vue`:

1. Add `data-testid="app-layout"` to the root `<div>`.
2. Add `<ErrorToast />` AFTER `<TheSearchModal />`:

```vue
<template>
  <div data-testid="app-layout" class="flex h-screen flex-col bg-surface text-gray-200">
    <TheTopBar :sidebar-collapsed="sidebarCollapsed" @toggle-sidebar="handleToggleSidebar" />
    <div class="flex flex-1 overflow-hidden">
      <TheSidebar
        :collapsed="sidebarCollapsed"
        :overlay-open="overlayOpen"
        @close-overlay="overlayOpen = false"
      />
      <main class="flex-1 overflow-hidden">
        <RouterView />
      </main>
    </div>
    <TheSearchModal />
    <ErrorToast />
  </div>
</template>
```

3. Add to imports:

```ts
import ErrorToast from '@/components/feedback/ErrorToast.vue';
```

4. If `packages/client/src/__tests__/layouts/AppLayout.test.ts` asserts on the rendered structure, update it to allow the additional `<ErrorToast>` mount.

- [ ] **Step 12: Run all client unit tests + verify coverage**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -30`
Expected: ALL pass, coverage ≥ thresholds in `.coverage-thresholds.json`.

- [ ] **Step 13: Commit**

```bash
git add packages/client/src/stores/toast.ts \
        packages/client/src/components/feedback/ErrorToast.vue \
        packages/client/src/__tests__/stores/toast.test.ts \
        packages/client/src/__tests__/components/feedback/ErrorToast.test.ts \
        packages/client/src/__tests__/lib/api.test.ts \
        packages/client/src/lib/api.ts \
        packages/client/src/layouts/AppLayout.vue \
        packages/client/src/__tests__/layouts/AppLayout.test.ts
git commit -m "feat(client): #52 add toast store + ErrorToast + 5xx wiring"
```

---

### Task 2: ErrorBoundary component + AppLayout wrapping

**Files:**

- Create: `packages/client/src/components/feedback/ErrorBoundary.vue`
- Create: `packages/client/src/__tests__/components/feedback/ErrorBoundary.test.ts`
- Modify: `packages/client/src/layouts/AppLayout.vue` (wrap `<RouterView>`)

- [ ] **Step 1: Write failing test**

```ts
// packages/client/src/__tests__/components/feedback/ErrorBoundary.test.ts
import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue';

const Throws = defineComponent({
  setup() {
    throw new Error('Render bomb');
  },
  render: () => h('div'),
});

const Healthy = defineComponent({
  render: () => h('div', { 'data-testid': 'happy-child' }, 'OK'),
});

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Healthy) } });
    expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(false);
  });

  it('renders the fallback when a child throws synchronously', async () => {
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Throws) } });
    await flushPromises();
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(true);
  });

  it('exposes a try-again button that resets state', async () => {
    let throwOnSetup = true;
    const ToggleThrows = defineComponent({
      setup() {
        if (throwOnSetup) throw new Error('first time');
        return () => h('div', { 'data-testid': 'recovered' }, 'OK');
      },
    });

    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(ToggleThrows) } });
    await flushPromises();
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(true);
    throwOnSetup = false;
    await wrapper.find('[data-testid="error-boundary-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="recovered"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/ErrorBoundary.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `ErrorBoundary.vue`**

```vue
<!-- packages/client/src/components/feedback/ErrorBoundary.vue -->
<template>
  <div
    v-if="hasError"
    data-testid="error-boundary-fallback"
    class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-300"
  >
    <h2 class="text-lg font-semibold text-white">Something went wrong</h2>
    <p class="text-sm">{{ message }}</p>
    <button
      data-testid="error-boundary-retry"
      class="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-700"
      @click="retry"
    >
      Try again
    </button>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const message = ref('');

onErrorCaptured((err) => {
  hasError.value = true;
  message.value = err instanceof Error ? err.message : String(err);
  return false; // stop propagation
});

function retry(): void {
  hasError.value = false;
  message.value = '';
}
</script>
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/ErrorBoundary.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Wrap `<RouterView>` in `AppLayout.vue`**

Replace the `<main>` block:

```vue
<main class="flex-1 overflow-hidden">
  <ErrorBoundary>
    <RouterView />
  </ErrorBoundary>
</main>
```

Add to imports:

```ts
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue';
```

Update `AppLayout.test.ts` if it asserts on `<RouterView>` placement.

- [ ] **Step 6: Run client unit tests**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/feedback/ErrorBoundary.vue \
        packages/client/src/__tests__/components/feedback/ErrorBoundary.test.ts \
        packages/client/src/layouts/AppLayout.vue \
        packages/client/src/__tests__/layouts/AppLayout.test.ts
git commit -m "feat(client): #52 add ErrorBoundary wrapping RouterView"
```

---

### Task 3: NotFoundPage + catch-all route

**Files:**

- Create: `packages/client/src/pages/NotFoundPage.vue`
- Create: `packages/client/src/__tests__/pages/NotFoundPage.test.ts`
- Modify: `packages/client/src/plugins/router.ts` (add catch-all)
- Modify: `packages/client/src/__tests__/plugins/router.test.ts` (cover catch-all)

- [ ] **Step 1: Write failing test for NotFoundPage**

```ts
// packages/client/src/__tests__/pages/NotFoundPage.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory, RouterLink } from 'vue-router';
import NotFoundPage from '@/pages/NotFoundPage.vue';

describe('NotFoundPage', () => {
  it('renders a 404 page with the standard testid and a back-to-home link', () => {
    const router = createRouter({
      history: createWebHistory(),
      routes: [
        { path: '/', name: 'home', component: { template: '<div>home</div>' } },
        { path: '/404', component: NotFoundPage },
      ],
    });
    const wrapper = mount(NotFoundPage, { global: { plugins: [router] } });
    expect(wrapper.find('[data-testid="not-found-page"]').exists()).toBe(true);
    const link = wrapper.findComponent(RouterLink);
    expect(link.exists()).toBe(true);
    expect(link.props('to')).toBe('/');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/pages/NotFoundPage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `NotFoundPage.vue`**

```vue
<!-- packages/client/src/pages/NotFoundPage.vue -->
<template>
  <div
    data-testid="not-found-page"
    class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <h1 class="text-3xl font-bold text-white">404 — Not found</h1>
    <p class="text-sm text-gray-400">The page you're looking for doesn't exist.</p>
    <RouterLink
      data-testid="not-found-back-home"
      to="/"
      class="rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
    >
      Back to home
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/pages/NotFoundPage.test.ts`
Expected: PASS.

- [ ] **Step 5: Add catch-all route**

In `packages/client/src/plugins/router.ts`, INSIDE the existing `children: [...]` array of the AppLayout-wrapped route block, append the catch-all entry as the LAST child:

```ts
        {
          path: ':pathMatch(.*)*',
          name: 'not-found',
          component: () => import('@/pages/NotFoundPage.vue'),
          meta: { requiresAuth: false },
        },
```

`meta.requiresAuth: false` overrides the parent's `requiresAuth: true` (per Vue Router 4 meta-merging) so unauthenticated users land on 404 directly rather than being redirected to login.

- [ ] **Step 6: Update router test to cover catch-all**

Append to `packages/client/src/__tests__/plugins/router.test.ts`:

```ts
it('matches /:pathMatch(.*)* to NotFoundPage', () => {
  const route = router.resolve('/this/does/not/exist');
  expect(route.name).toBe('not-found');
});
```

- [ ] **Step 7: Run all client unit tests**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass.

- [ ] **Step 8: Commit**

```bash
git add packages/client/src/pages/NotFoundPage.vue \
        packages/client/src/__tests__/pages/NotFoundPage.test.ts \
        packages/client/src/plugins/router.ts \
        packages/client/src/__tests__/plugins/router.test.ts
git commit -m "feat(client): #52 add 404 catch-all route + NotFoundPage"
```

---

### Task 4: Keyboard shortcuts (n, /, ?) + KeyboardShortcutsHelp

**Files:**

- Create: `packages/client/src/components/shell/KeyboardShortcutsHelp.vue`
- Create: `packages/client/src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts`
- Modify: `packages/client/src/components/shell/TheTopBar.vue` (register `/`)
- Modify: `packages/client/src/layouts/AppLayout.vue` (mount help, register `n` and `?`)
- Modify: `packages/client/src/__tests__/components/shell/TheTopBar.test.ts` (cover new registration)
- Modify: `packages/client/src/__tests__/layouts/AppLayout.test.ts` (cover new registrations + help mount)

- [ ] **Step 1: Write failing test for `KeyboardShortcutsHelp.vue`**

```ts
// packages/client/src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import KeyboardShortcutsHelp from '@/components/shell/KeyboardShortcutsHelp.vue';

describe('KeyboardShortcutsHelp', () => {
  it('hidden by default', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: false } });
    expect(wrapper.find('[data-testid="keyboard-shortcuts-help"]').exists()).toBe(false);
  });

  it('renders all 4 documented shortcuts when open', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    const dialog = wrapper.find('[data-testid="keyboard-shortcuts-help"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('Cmd+K');
    expect(dialog.text()).toContain('n');
    expect(dialog.text()).toContain('/');
    expect(dialog.text()).toContain('?');
  });

  it('emits close when dismiss button is clicked', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    await wrapper.find('[data-testid="keyboard-shortcuts-help-close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders with role=dialog and aria-modal=true', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    const dialog = wrapper.find('[data-testid="keyboard-shortcuts-help"]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `KeyboardShortcutsHelp.vue`**

```vue
<!-- packages/client/src/components/shell/KeyboardShortcutsHelp.vue -->
<template>
  <div
    v-if="open"
    data-testid="keyboard-shortcuts-help"
    role="dialog"
    aria-modal="true"
    aria-labelledby="keyboard-shortcuts-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="$emit('close')"
  >
    <div
      class="mx-4 w-full max-w-md rounded-lg border border-gray-700 bg-surface p-6 text-gray-200"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 id="keyboard-shortcuts-title" class="text-lg font-semibold">Keyboard shortcuts</h2>
        <button
          data-testid="keyboard-shortcuts-help-close"
          aria-label="Close keyboard shortcuts help"
          class="text-gray-400 hover:text-white"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">Cmd+K</kbd>
        </dt>
        <dd>Open search</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">n</kbd>
        </dt>
        <dd>New post</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">/</kbd>
        </dt>
        <dd>Focus search</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">?</kbd>
        </dt>
        <dd>Show shortcuts</dd>
      </dl>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
</script>
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Register `/` in TheTopBar**

In `packages/client/src/components/shell/TheTopBar.vue` `<script setup>`, after the existing `register('mod+k', ...)` line:

```ts
register('/', () => searchStore.open());
```

- [ ] **Step 6: Register `n` and `?` in AppLayout**

In `packages/client/src/layouts/AppLayout.vue` `<script setup>`:

```ts
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useKeyboard } from '@/composables/useKeyboard';
import KeyboardShortcutsHelp from '@/components/shell/KeyboardShortcutsHelp.vue';

const router = useRouter();
const { register } = useKeyboard();
const helpOpen = ref(false);

register('n', () => router.push('/posts/new'));
register('?', () => {
  helpOpen.value = true;
});
```

In the template, add after `<ErrorToast />`:

```vue
<KeyboardShortcutsHelp :open="helpOpen" @close="helpOpen = false" />
```

**Verification of `?` registration**: `useKeyboard.ts:24-34` `parseShortcut('?')` returns `{ key: '?', mod: false }`. `matchesShortcut` compares `event.key.toLowerCase() === '?'`. Pressing Shift+/ on US layout fires `event.key === '?'` (modifier already encoded into the key). Lowercasing `'?'` is `'?'`. Match. If empirical testing reveals the registry never matches `?`, implement a custom matcher in AppLayout that bypasses `parseShortcut`. This is the documented fallback path; do not block on it.

- [ ] **Step 7: Update `TheTopBar.test.ts` for the `/` registration**

In `packages/client/src/__tests__/components/shell/TheTopBar.test.ts`, append:

```ts
it('registers the / shortcut to open the search modal', async () => {
  // Reuse whatever test setup the existing mod+k test uses
  // Dispatch a `/` keydown
  window.dispatchEvent(new KeyboardEvent('keydown', { key: '/' }));
  // Assert searchStore.open was called
  // (mirror the existing mod+k assertion pattern in this file)
});
```

If no existing pattern is present, lift the setup from `useKeyboard.test.ts`.

- [ ] **Step 8: Update `AppLayout.test.ts` for n / ? registrations**

Append assertions that:

- `n` keydown navigates to `/posts/new` (mock `useRouter().push`)
- `?` keydown sets `helpOpen.value = true` and renders `<KeyboardShortcutsHelp :open="true">`

- [ ] **Step 9: Run all client unit tests + verify coverage**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass.

- [ ] **Step 10: Commit**

```bash
git add packages/client/src/components/shell/KeyboardShortcutsHelp.vue \
        packages/client/src/__tests__/components/shell/KeyboardShortcutsHelp.test.ts \
        packages/client/src/__tests__/components/shell/TheTopBar.test.ts \
        packages/client/src/components/shell/TheTopBar.vue \
        packages/client/src/layouts/AppLayout.vue \
        packages/client/src/__tests__/layouts/AppLayout.test.ts
git commit -m "feat(client): #52 add keyboard shortcuts (n, /, ?) + help modal"
```

---

### Task 5: Breadcrumbs component + PostViewPage integration

**Files:**

- Create: `packages/client/src/components/feedback/Breadcrumbs.vue`
- Create: `packages/client/src/__tests__/components/feedback/Breadcrumbs.test.ts`
- Modify: `packages/client/src/pages/PostViewPage.vue` (mount Breadcrumbs above the post header)

- [ ] **Step 1: Write failing test for `Breadcrumbs.vue`**

```ts
// packages/client/src/__tests__/components/feedback/Breadcrumbs.test.ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory, RouterLink } from 'vue-router';
import Breadcrumbs from '@/components/feedback/Breadcrumbs.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/posts/:id', name: 'post-view', component: { template: '<div/>' } },
  ],
});

describe('Breadcrumbs', () => {
  it('renders nothing for a single-item trail', () => {
    const wrapper = mount(Breadcrumbs, {
      props: { items: [{ label: 'Home', to: '/' }] },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="breadcrumbs"]').exists()).toBe(false);
  });

  it('renders an ordered trail with the last item as plain text', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Home', to: '/' },
          { label: 'My snippet', to: null },
        ],
      },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="breadcrumbs"]').exists()).toBe(true);
    const links = wrapper.findAllComponents(RouterLink);
    expect(links).toHaveLength(1);
    expect(links[0]!.props('to')).toBe('/');
    expect(wrapper.find('[data-testid="breadcrumb-current"]').text()).toBe('My snippet');
  });

  it('renders nav with aria-label="Breadcrumb"', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Home', to: '/' },
          { label: 'X', to: null },
        ],
      },
      global: { plugins: [router] },
    });
    const nav = wrapper.find('[data-testid="breadcrumbs"]');
    expect(nav.element.tagName).toBe('NAV');
    expect(nav.attributes('aria-label')).toBe('Breadcrumb');
  });
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/Breadcrumbs.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `Breadcrumbs.vue`**

```vue
<!-- packages/client/src/components/feedback/Breadcrumbs.vue -->
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
```

- [ ] **Step 4: Run test to verify pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/feedback/Breadcrumbs.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Mount Breadcrumbs in PostViewPage.vue**

In `packages/client/src/pages/PostViewPage.vue`, render `<Breadcrumbs>` AT THE TOP of the main panel (above the post header), only when `currentPost` is loaded. Add to `<script setup>` imports:

```ts
import Breadcrumbs from '@/components/feedback/Breadcrumbs.vue';
```

In template, before the post-header block:

```vue
<Breadcrumbs
  v-if="currentPost"
  :items="[
    { label: 'Home', to: '/' },
    { label: currentPost.title, to: null },
  ]"
/>
```

- [ ] **Step 6: Run all client unit tests + coverage**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/feedback/Breadcrumbs.vue \
        packages/client/src/__tests__/components/feedback/Breadcrumbs.test.ts \
        packages/client/src/pages/PostViewPage.vue
git commit -m "feat(client): #52 add Breadcrumbs component + PostView integration"
```

---

### Task 6: data-testid additions on shell components + logo→RouterLink

**Files:**

- Modify: `packages/client/src/components/shell/TheTopBar.vue` (logo→RouterLink, dark-mode-toggle, sidebar-toggle, top-bar testids)
- Modify: `packages/client/src/components/shell/TheSidebar.vue` (sidebar-desktop, mobile-nav-drawer testids)
- Modify: `packages/client/src/components/shell/TheSearchModal.vue` (search-dialog testid)

**Note:** Existing testids ALREADY exist and MUST NOT be renamed: `search-trigger`, `user-menu-trigger`, `home-nav-link`, `trending-nav-link`, `my-snippets-nav-link`, `bookmarks-nav-link`, `following-nav-link`, `search-backdrop`, `search-input`, `search-close-btn`, `recent-searches`, `ai-toggle`, `see-all-results`, `popular-tags-list`, `popular-tag-row-{name}`, `subscribed-tag-link-{name}`, `profile-action`, `my-snippets-action`, `settings-action`, `logout-action`.

- [ ] **Step 1: Convert the Forge logo to a `<RouterLink>` and add `data-testid="logo-link"`**

In `packages/client/src/components/shell/TheTopBar.vue`, replace the `<span>Forge</span>` block (line 19) with:

```vue
<RouterLink to="/" data-testid="logo-link" class="flex items-center gap-2">
  <span class="text-lg font-bold text-primary">Forge</span>
</RouterLink>
```

Add to `<script setup>` imports:

```ts
import { RouterLink } from 'vue-router';
```

- [ ] **Step 2: Add testids on TheTopBar buttons + header**

- The mobile sidebar-toggle button (line 5): add `data-testid="sidebar-toggle-btn"`
- The dark-mode-toggle button (line 34): add `data-testid="dark-mode-toggle"`
- The header itself: add `data-testid="top-bar"`

- [ ] **Step 3: Add testids on TheSidebar**

- The desktop `<aside>` (line 4): add `data-testid="sidebar-desktop"`
- The mobile `<aside>` inside the Teleport overlay (line ~100): add `data-testid="mobile-nav-drawer"`

- [ ] **Step 4: Add dialog testid on TheSearchModal**

The inner `<div role="dialog">` (line 8): add `data-testid="search-dialog"`. Keep the existing `data-testid="search-backdrop"` on the outer.

- [ ] **Step 5: Update TheTopBar.test.ts to cover the logo RouterLink**

Add an assertion that the logo is now a RouterLink rendering with `to="/"` and the `logo-link` testid.

- [ ] **Step 6: Run all client unit tests + coverage**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass.

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/components/shell/TheTopBar.vue \
        packages/client/src/components/shell/TheSidebar.vue \
        packages/client/src/components/shell/TheSearchModal.vue \
        packages/client/src/__tests__/components/shell/
git commit -m "test(client): #52 add data-testid hooks across shell + logo→RouterLink"
```

---

### Task 7: Selectors consolidation in `e2e/fixtures/selectors/shell.ts`

**Files:**

- Modify: `e2e/fixtures/selectors/shell.ts`

- [ ] **Step 1: Replace `e2e/fixtures/selectors/shell.ts` content**

```ts
// e2e/fixtures/selectors/shell.ts
import type { Page, Locator } from '@playwright/test';

/**
 * Cross-cutting selectors used by the shell + accessibility specs (#52).
 *
 * Convention:
 *   - Interactive: kebab + role suffix (e.g. 'submit-btn').
 *   - Content/state: bare kebab nouns (e.g. 'error-message').
 *   - Selection always uses getByTestId; assertions on copy use toContainText.
 */
export const shell = {
  // ── Layout ─────────────────────────────────────────────────────────
  appLayout: (page: Page): Locator => page.getByTestId('app-layout'),
  topBar: (page: Page): Locator => page.getByTestId('top-bar'),
  sidebarDesktop: (page: Page): Locator => page.getByTestId('sidebar-desktop'),
  mobileNavDrawer: (page: Page): Locator => page.getByTestId('mobile-nav-drawer'),

  // ── Top bar elements ───────────────────────────────────────────────
  logoLink: (page: Page): Locator => page.getByTestId('logo-link'),
  searchTrigger: (page: Page): Locator => page.getByTestId('search-trigger'),
  darkModeToggle: (page: Page): Locator => page.getByTestId('dark-mode-toggle'),
  sidebarToggleBtn: (page: Page): Locator => page.getByTestId('sidebar-toggle-btn'),

  // ── Sidebar nav ────────────────────────────────────────────────────
  homeNavLink: (page: Page): Locator => page.getByTestId('home-nav-link'),
  trendingNavLink: (page: Page): Locator => page.getByTestId('trending-nav-link'),
  mySnippetsNavLink: (page: Page): Locator => page.getByTestId('my-snippets-nav-link'),
  bookmarksNavLink: (page: Page): Locator => page.getByTestId('bookmarks-nav-link'),
  followingNavLink: (page: Page): Locator => page.getByTestId('following-nav-link'),

  // ── User menu ──────────────────────────────────────────────────────
  userMenuTrigger: (page: Page): Locator => page.getByTestId('user-menu-trigger'),
  profileAction: (page: Page): Locator => page.getByTestId('profile-action'),
  mySnippetsAction: (page: Page): Locator => page.getByTestId('my-snippets-action'),
  settingsAction: (page: Page): Locator => page.getByTestId('settings-action'),
  logoutAction: (page: Page): Locator => page.getByTestId('logout-action'),

  // ── Search modal ───────────────────────────────────────────────────
  searchBackdrop: (page: Page): Locator => page.getByTestId('search-backdrop'),
  searchDialog: (page: Page): Locator => page.getByTestId('search-dialog'),
  searchInput: (page: Page): Locator => page.getByTestId('search-input'),
  searchCloseBtn: (page: Page): Locator => page.getByTestId('search-close-btn'),

  // ── Keyboard help ──────────────────────────────────────────────────
  keyboardShortcutsHelp: (page: Page): Locator => page.getByTestId('keyboard-shortcuts-help'),
  keyboardShortcutsHelpClose: (page: Page): Locator =>
    page.getByTestId('keyboard-shortcuts-help-close'),

  // ── Error toast ────────────────────────────────────────────────────
  errorToastStack: (page: Page): Locator => page.getByTestId('error-toast-stack'),
  errorToast: (page: Page): Locator => page.getByTestId('error-toast'),
  errorToastDismiss: (page: Page): Locator => page.getByTestId('error-toast-dismiss'),

  // ── Error boundary ─────────────────────────────────────────────────
  errorBoundaryFallback: (page: Page): Locator => page.getByTestId('error-boundary-fallback'),
  errorBoundaryRetry: (page: Page): Locator => page.getByTestId('error-boundary-retry'),

  // ── 404 ────────────────────────────────────────────────────────────
  notFoundPage: (page: Page): Locator => page.getByTestId('not-found-page'),
  notFoundBackHome: (page: Page): Locator => page.getByTestId('not-found-back-home'),

  // ── Breadcrumbs ────────────────────────────────────────────────────
  breadcrumbs: (page: Page): Locator => page.getByTestId('breadcrumbs'),
  breadcrumbCurrent: (page: Page): Locator => page.getByTestId('breadcrumb-current'),
  breadcrumbLink: (page: Page, idx: number): Locator => page.getByTestId(`breadcrumb-link-${idx}`),

  // ── Generic forbidden / not-permitted page (kept from prior shape) ─
  forbiddenPage: (page: Page): Locator => page.getByTestId('forbidden-page'),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e2e && npx tsc --noEmit 2>&1 | tail -15`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/selectors/shell.ts
git commit -m "test(e2e): #52 consolidate shell selectors"
```

---

### Task 8: Network-faults helpers

**Files:**

- Modify: `e2e/fixtures/network-faults.ts`

- [ ] **Step 1: Replace `e2e/fixtures/network-faults.ts` content**

```ts
// e2e/fixtures/network-faults.ts
import type { Page } from '@playwright/test';

/**
 * Single-audit-point for opt-in route-mocked network failures used by E2E
 * specs. Each helper returns a Promise that resolves once the route is
 * registered. Specs SHOULD call `page.unroute(urlGlob)` in an afterEach to
 * avoid leaking handlers across tests, OR rely on a fresh `actor` per test
 * (default behavior in `e2e/fixtures/auth.ts:46-58`).
 */

/** Fail any matching request with HTTP 500 + JSON body. */
export async function api500(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' }),
    });
  });
}

/** Return malformed JSON (HTTP 200 with an unparseable body). */
export async function apiInvalidJson(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: 'not-json{',
    });
  });
}

/** Abort the request entirely, simulating an offline / DNS / connection-reset condition. */
export async function apiNetworkError(page: Page, urlGlob: string): Promise<void> {
  await page.route(urlGlob, (route) => route.abort('failed'));
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd e2e && npx tsc --noEmit 2>&1 | tail -15`
Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add e2e/fixtures/network-faults.ts
git commit -m "test(e2e): #52 populate network-faults with named exports"
```

---

## Phase B — E2E specs

### Spec authoring conventions

Every shell spec:

- Imports `test, expect` from `e2e/fixtures/reset.ts` (provides per-worker reset + `actor` fixture).
- Uses the `actor` fixture (per-worker user) — never `testuser`.
- Uses `shell` selectors from `e2e/fixtures/selectors/shell.ts`.
- Where 5xx / invalid-JSON faults are needed, calls helpers from `e2e/fixtures/network-faults.ts`.
- Closes with NO global state pollution (uses `actor.unroute(urlGlob)` after route mocking).

---

### Task 9: top-nav.spec.ts (logo + search + user-menu)

**Files:**

- Create: `e2e/specs/shell/top-nav.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/top-nav.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: top nav', () => {
  test('logo click navigates to home', async ({ actor }) => {
    await actor.goto('/trending');
    await expect(actor).toHaveURL(/\/trending$/);

    await shell.logoLink(actor).click();
    await expect(actor).toHaveURL(/\/$/);
    await expect(shell.appLayout(actor)).toBeVisible();
  });

  test('search-trigger button opens the search modal', async ({ actor }) => {
    await actor.goto('/');
    await expect(shell.searchDialog(actor)).toBeHidden();
    await shell.searchTrigger(actor).click();
    await expect(shell.searchDialog(actor)).toBeVisible();
    await shell.searchCloseBtn(actor).click();
    await expect(shell.searchDialog(actor)).toBeHidden();
  });

  test('user-menu opens and renders the documented action items', async ({ actor }) => {
    await actor.goto('/');
    await shell.userMenuTrigger(actor).click();
    await expect(shell.profileAction(actor)).toBeVisible();
    await expect(shell.mySnippetsAction(actor)).toBeVisible();
    await expect(shell.settingsAction(actor)).toBeVisible();
    await expect(shell.logoutAction(actor)).toBeVisible();
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/top-nav.spec.ts --workers=1`
Expected: 3 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/top-nav.spec.ts --workers=4`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/top-nav.spec.ts
git commit -m "test(e2e): #52 top-nav spec (logo, search, user menu)"
```

---

### Task 10: sidebar-nav.spec.ts

**Files:**

- Create: `e2e/specs/shell/sidebar-nav.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/sidebar-nav.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: sidebar nav', () => {
  test('home / trending / my-snippets / bookmarks / following links route correctly', async ({
    actor,
  }) => {
    await actor.goto('/');

    await shell.trendingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/trending$/);

    await shell.mySnippetsNavLink(actor).click();
    await expect(actor).toHaveURL(/\/my-snippets$/);

    await shell.bookmarksNavLink(actor).click();
    await expect(actor).toHaveURL(/\/bookmarks$/);

    await shell.followingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/following$/);

    await shell.homeNavLink(actor).click();
    await expect(actor).toHaveURL(/\/$/);
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/sidebar-nav.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/sidebar-nav.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/sidebar-nav.spec.ts
git commit -m "test(e2e): #52 sidebar-nav spec"
```

---

### Task 11: dark-mode.spec.ts

**Files:**

- Create: `e2e/specs/shell/dark-mode.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/dark-mode.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: dark-mode', () => {
  test('toggle persists across navigation', async ({ actor }) => {
    await actor.goto('/');

    const initialDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );

    await shell.darkModeToggle(actor).click();
    const afterToggleDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(afterToggleDark).toBe(!initialDark);

    await shell.trendingNavLink(actor).click();
    await expect(actor).toHaveURL(/\/trending$/);

    const navDark = await actor.evaluate(() => document.documentElement.classList.contains('dark'));
    expect(navDark).toBe(afterToggleDark);

    const stored = await actor.evaluate(() => localStorage.getItem('forge-theme'));
    expect(stored).toBe(afterToggleDark ? 'dark' : 'light');
  });

  test('toggle persists across reload', async ({ actor }) => {
    await actor.goto('/');

    const initialDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    await shell.darkModeToggle(actor).click();
    const afterToggleDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(afterToggleDark).toBe(!initialDark);

    await actor.reload();
    const afterReloadDark = await actor.evaluate(() =>
      document.documentElement.classList.contains('dark'),
    );
    expect(afterReloadDark).toBe(afterToggleDark);
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/dark-mode.spec.ts --workers=1`
Expected: 2 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/dark-mode.spec.ts --workers=4`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/dark-mode.spec.ts
git commit -m "test(e2e): #52 dark-mode persistence (nav + reload)"
```

---

### Task 12: keyboard-shortcuts.spec.ts

**Files:**

- Create: `e2e/specs/shell/keyboard-shortcuts.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/keyboard-shortcuts.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

const SEARCH_OPEN_KEY = process.platform === 'darwin' ? 'Meta+K' : 'Control+K';

test.describe('shell: keyboard shortcuts', () => {
  test('Cmd/Ctrl+K opens the search modal', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="search-trigger"]') !== null,
    );
    await expect(shell.searchDialog(actor)).toBeHidden();
    await actor.keyboard.press(SEARCH_OPEN_KEY);
    await expect(shell.searchDialog(actor)).toBeVisible();
    await expect(shell.searchInput(actor)).toBeFocused();
  });

  test('n navigates to /posts/new', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="app-layout"]') !== null,
    );
    await actor.keyboard.press('n');
    await expect(actor).toHaveURL(/\/posts\/new$/);
  });

  test('/ opens the search modal and focuses the input', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="search-trigger"]') !== null,
    );
    await expect(shell.searchDialog(actor)).toBeHidden();
    await actor.keyboard.press('/');
    await expect(shell.searchDialog(actor)).toBeVisible();
    await expect(shell.searchInput(actor)).toBeFocused();
  });

  test('? opens the keyboard-shortcuts help modal', async ({ actor }) => {
    await actor.goto('/');
    await actor.waitForFunction(
      () => document.querySelector('[data-testid="app-layout"]') !== null,
    );
    await expect(shell.keyboardShortcutsHelp(actor)).toBeHidden();
    // Shift+/ produces event.key === '?' on US layout
    await actor.keyboard.press('Shift+Slash');
    await expect(shell.keyboardShortcutsHelp(actor)).toBeVisible();

    await shell.keyboardShortcutsHelpClose(actor).click();
    await expect(shell.keyboardShortcutsHelp(actor)).toBeHidden();
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/keyboard-shortcuts.spec.ts --workers=1`
Expected: 4 passed. If `?` does not match (registry interaction with shifted keys), fall back to a custom matcher in `AppLayout.vue` that bypasses `parseShortcut`.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/keyboard-shortcuts.spec.ts --workers=4`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/keyboard-shortcuts.spec.ts
git commit -m "test(e2e): #52 keyboard shortcuts (Cmd+K, n, /, ?)"
```

---

### Task 13: error-toast-5xx.spec.ts

**Files:**

- Create: `e2e/specs/shell/error-toast-5xx.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/error-toast-5xx.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';
import { api500 } from '../../fixtures/network-faults.js';

test.describe('shell: error toast on 5xx', () => {
  test('shows toast when /api/posts feed returns 500, dismissable by user', async ({ actor }) => {
    await api500(actor, '**/api/posts**');

    await actor.goto('/');

    await expect(shell.errorToast(actor).first()).toBeVisible();
    await expect(shell.errorToast(actor).first()).toHaveAttribute('role', 'status');

    await shell.errorToastDismiss(actor).first().click();
    await expect(shell.errorToast(actor)).toHaveCount(0);

    await actor.unroute('**/api/posts**');
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/error-toast-5xx.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/error-toast-5xx.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/error-toast-5xx.spec.ts
git commit -m "test(e2e): #52 error toast on 5xx"
```

---

### Task 14: error-boundary.spec.ts

**Files:**

- Create: `e2e/specs/shell/error-boundary.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/error-boundary.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';
import { apiInvalidJson } from '../../fixtures/network-faults.js';

test.describe('shell: error boundary on render fail', () => {
  test('catches downstream render error from malformed API JSON', async ({ actor }) => {
    // Return malformed JSON for the post-detail endpoint. PostViewPage's
    // useFetchPost callsite does response.json() which throws synchronously
    // during async setup() — Vue 3's onErrorCaptured catches it.
    await apiInvalidJson(actor, '**/api/posts/c0000000-0000-0000-0000-000000000099');

    await actor.goto('/posts/c0000000-0000-0000-0000-000000000099');

    await expect(shell.errorBoundaryFallback(actor)).toBeVisible();

    await actor.unroute('**/api/posts/c0000000-0000-0000-0000-000000000099');
  });
});
```

**Failure-mode handling:** If `usePosts.fetchPost` swallows the JSON-parse error internally (graceful UX), the boundary won't fire. In that case, pivot to one of:

1. Use the init-script fixture to inject `window.__E2E_FORCE_RENDER_ERROR__ = true` and add a one-line `if (window.__E2E_FORCE_RENDER_ERROR__) throw new Error('e2e bomb')` inside PostViewPage's `<script setup>` (gated on `import.meta.env.MODE !== 'production'`).
2. Force a different endpoint that DOES throw on parse — e.g., `/api/auth/me` if the auth bootstrap calls `response.json()` unguarded.

Determine the fallback during implementation; both options are <10 lines of code change.

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/error-boundary.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/error-boundary.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/error-boundary.spec.ts
git commit -m "test(e2e): #52 error boundary catches render failures"
```

---

### Task 15: not-found-404.spec.ts

**Files:**

- Create: `e2e/specs/shell/not-found-404.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/not-found-404.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: 404 page', () => {
  test('catch-all renders NotFoundPage for unknown URL; back-home link routes home', async ({
    actor,
  }) => {
    await actor.goto('/this/does/not/exist');
    await expect(shell.notFoundPage(actor)).toBeVisible();
    await expect(shell.sidebarDesktop(actor)).toBeVisible();
    await shell.notFoundBackHome(actor).click();
    await expect(actor).toHaveURL(/\/$/);
  });

  test('post UUID 00000000-...-0 lands on the page-level not-found state, not the catch-all', async ({
    actor,
  }) => {
    await actor.goto('/posts/00000000-0000-0000-0000-000000000000');
    await expect(actor).toHaveURL(/\/posts\/00000000-0000-0000-0000-000000000000/);
    // Either the post-page renders an internal "not found" or an error state;
    // the URL did NOT redirect to the catch-all (URL still matches the post path).
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/not-found-404.spec.ts --workers=1`
Expected: 2 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/not-found-404.spec.ts --workers=4`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/not-found-404.spec.ts
git commit -m "test(e2e): #52 catch-all 404 spec (unknown URL + invalid UUID)"
```

---

### Task 16: unauthenticated-redirect.spec.ts

**Files:**

- Create: `e2e/specs/shell/unauthenticated-redirect.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/unauthenticated-redirect.spec.ts
import { test, expect } from '../../fixtures/reset.js';

test.describe('shell: 401 redirects to login', () => {
  test('clearing cookies + reload sends user to /login with redirect param', async ({ actor }) => {
    await actor.goto('/');
    await expect(actor).toHaveURL(/\/$/);

    await actor.context().clearCookies();
    await actor.evaluate(() => window.localStorage.clear());

    await actor.goto('/');

    await expect(actor).toHaveURL(/\/login(\?.*)?$/);
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/unauthenticated-redirect.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/unauthenticated-redirect.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/unauthenticated-redirect.spec.ts
git commit -m "test(e2e): #52 unauthenticated user redirects to login"
```

---

### Task 17: breadcrumbs.spec.ts

**Files:**

- Create: `e2e/specs/shell/breadcrumbs.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/breadcrumbs.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: breadcrumbs', () => {
  test('post detail page shows Home > [post title] with home as a working link', async ({
    actor,
  }) => {
    // Seeded post UUID from bruno/environments/local.bru — public, viewable by any actor
    const postId = 'c0000000-0000-0000-0000-000000000099';
    await actor.goto(`/posts/${postId}`);

    await expect(shell.breadcrumbs(actor)).toBeVisible();
    await expect(shell.breadcrumbs(actor)).toHaveAttribute('aria-label', 'Breadcrumb');

    const current = shell.breadcrumbCurrent(actor);
    await expect(current).toBeVisible();
    await expect(current).toHaveAttribute('aria-current', 'page');

    await shell.breadcrumbLink(actor, 0).click();
    await expect(actor).toHaveURL(/\/$/);
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/breadcrumbs.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/breadcrumbs.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/breadcrumbs.spec.ts
git commit -m "test(e2e): #52 breadcrumbs render on post detail"
```

---

### Task 18: mobile-responsive.spec.ts + axe-core a11y scan

**Files:**

- Create: `e2e/specs/shell/mobile-responsive.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// e2e/specs/shell/mobile-responsive.spec.ts
import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';

test.describe('shell: mobile responsive smoke', () => {
  test('at 375x812 the desktop sidebar is hidden and the mobile-nav drawer is reachable', async ({
    actor,
  }) => {
    await actor.setViewportSize({ width: 375, height: 812 });
    await actor.goto('/');

    await expect(shell.sidebarDesktop(actor)).toBeHidden();
    await expect(shell.sidebarToggleBtn(actor)).toBeVisible();

    await shell.sidebarToggleBtn(actor).click();
    await expect(shell.mobileNavDrawer(actor)).toBeVisible();

    await expect(shell.homeNavLink(actor).last()).toBeVisible();

    // Accessibility scan at the mobile viewport — scoped to the shell.
    // Color-contrast disabled per established pattern (chrome-wide #ff6b1a
    // brand-color contrast tracked outside this issue).
    const axeResults = await new AxeBuilder({ page: actor })
      .include('[data-testid="app-layout"]')
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    expect(axeResults.violations).toEqual([]);
  });
});
```

- [ ] **Step 2: Run at workers=1**

Run: `cd e2e && npx playwright test specs/shell/mobile-responsive.spec.ts --workers=1`
Expected: 1 passed.

- [ ] **Step 3: Run at workers=4**

Run: `cd e2e && npx playwright test specs/shell/mobile-responsive.spec.ts --workers=4`
Expected: 1 passed.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/shell/mobile-responsive.spec.ts
git commit -m "test(e2e): #52 mobile responsive smoke + axe-core a11y scan"
```

---

## Phase C — Cross-spec validation, knowledge capture, PR

### Task 19: Full-suite run at workers=1 AND workers=4

- [ ] **Step 1: Run the full suite at workers=1**

Run: `cd e2e && npx playwright test --workers=1 2>&1 | tail -40`
Expected: ALL pass.

- [ ] **Step 2: Run the full suite at workers=4**

Run: `cd e2e && npx playwright test --workers=4 2>&1 | tail -40`
Expected: ALL pass.

- [ ] **Step 3: Run only the new shell folder at workers=4 — measure runtime**

Run: `time (cd e2e && npx playwright test specs/shell --workers=4) 2>&1 | tail -10`
Expected: < 2 minutes locally.

### Task 20: Vitest + coverage gate

- [ ] **Step 1: Run client coverage**

Run: `cd packages/client && npm run test:coverage 2>&1 | tail -30`
Expected: ALL pass, coverage ≥ thresholds in `.coverage-thresholds.json`.

- [ ] **Step 2: Run server coverage (sanity — should be unchanged)**

Run: `cd packages/server && npm run test:coverage 2>&1 | tail -15`
Expected: ALL pass, no regression.

### Task 21: Bruno suite (sanity — no endpoint changes)

- [ ] **Step 1: Start the API server with E2E flags**

```bash
set -a && source .env && set +a && cd packages/server && \
  HOST=localhost ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 NODE_ENV=test \
  npx tsx src/server.ts
```

- [ ] **Step 2: Run the full Bruno suite**

Run: `cd bruno && npx @usebruno/cli run -r --env local 2>&1 | tail -30`
Expected: ALL existing tests pass. NO new `.bru` files added.

### Task 22: Self-reflect + knowledge capture (BEFORE creating PR)

Per CLAUDE.md "Pre-PR Knowledge Capture":

- [ ] **Step 1: Run `/self-reflect`**

Captures learnings (e.g., the toast store + 5xx wiring pattern, ErrorBoundary + Suspense tradeoffs, Vue Router 4 catch-all meta-merging, `?` registration via `parseShortcut`, scope-reconciliation pattern when DoD assumes missing features) into `.beads/knowledge/`.

- [ ] **Step 2: Commit knowledge updates**

```bash
git add .beads/knowledge/
git commit -m "docs(knowledge): #52 capture learnings from shell + a11y rollout"
```

### Task 23: Tracking issue #43 update

- [ ] **Step 1: Comment on #43 (after merge)**

Spec count: 10 active spec files, 16 test cases. Cumulative spec count across rolled-out folders. Cumulative CI runtime. Mark #52 done as 7/9.

### Task 24: Create the PR + 3 consecutive green CI runs

- [ ] **Step 1: Push branch + open PR**

```bash
git push -u origin feat/e2e-shell
gh pr create --title "feat(e2e): #52 E2E shell + accessibility" --body "$(cat <<'EOF'
## Summary

Issue #52 ships the 7th of 9 E2E rollout issues (parent #43) with full DoD coverage. Per user authorization (Path B), this PR also builds the 5 net-new client surfaces the DoD assumes exist: toast store + ErrorToast (with global 5xx wiring), ErrorBoundary, NotFoundPage + catch-all route, Breadcrumbs, KeyboardShortcutsHelp + 3 new keyboard shortcuts (n / / / ?).

## What's in this PR

**Client surface work:**
- New: toast Pinia store, ErrorToast (mounted in AppLayout), ErrorBoundary (wraps RouterView), Breadcrumbs (rendered on PostViewPage), KeyboardShortcutsHelp, NotFoundPage
- Modified: lib/api.ts emits a toast on every 5xx response (via maybePushServerError)
- Modified: plugins/router.ts adds catch-all `:pathMatch(.*)*`
- Converted: TheTopBar's `<span>Forge</span>` → `<RouterLink to="/">`
- Added: data-testid hooks on AppLayout / TheTopBar / TheSidebar / TheSearchModal / mobile-nav-drawer
- 3 new keyboard registrations: `n` (new post), `/` (open search), `?` (open help)

**E2E specs (10 files, 16 test cases):**
- top-nav, sidebar-nav, dark-mode (nav + reload), keyboard-shortcuts (Cmd+K, n, /, ?), error-toast-5xx, error-boundary, not-found-404, unauthenticated-redirect, breadcrumbs, mobile-responsive (with axe-core)

**Vitest coverage:** new components ship with 100% lines/branches/functions/statements per `.coverage-thresholds.json`.

## Test plan

- [ ] `npm run e2e -- specs/shell` passes at workers=1 AND workers=4 locally
- [ ] `cd packages/client && npm run test:coverage` — all green, thresholds met
- [ ] `cd packages/server && npm run test:coverage` — no regression
- [ ] Bruno suite passes (no endpoint changes)
- [ ] CI runtime under 10 min total
- [ ] 3 consecutive green CI runs before merge

Closes #52

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 2: Use `/pr-shepherd <PR>` to monitor through 3 consecutive green CI runs**

If CI is flaky, fix the flake before merging — do not paper over with retries.

---

## Decision points for user (consolidated)

1. **Scope expansion authorization**: 2026-05-07 — user explicitly opted into Path B. No further user decision required on scope.
2. **Execution method**: subagent-driven development (already chosen).
3. **`?` shortcut fallback**: if the `useKeyboard` registry doesn't match shifted keys (Task 4 Step 6 caveat), the implementer MAY add a custom matcher in `AppLayout.vue` that bypasses `parseShortcut` for the `?` key. Document the fallback in commit message.
4. **Error-boundary failure mode**: if the JSON-parse-bomb path is swallowed gracefully (Task 14 caveat), the implementer MAY pivot to an init-script-injected synchronous render bomb gated on non-production builds. Document the pivot in commit message.

---

## Self-review checklist

- [x] **Spec coverage.** Every DoD bullet from issue #52 maps to a Phase A and/or Phase B task:
  - top nav (logo, profile menu, search button) → Task 6 (logo→RouterLink), Task 9 (spec, 3 tests)
  - sidebar nav → Task 10
  - dark-mode toggle persistence (nav + reload) → Task 11 (2 tests)
  - keyboard shortcuts (Cmd+K, n, /, ?) → Task 4 (build), Task 12 (4 tests)
  - error toast on 5xx → Task 1 (build), Task 13 (spec)
  - error boundary on render fail → Task 2 (build), Task 14 (spec)
  - 404 page → Task 3 (build), Task 15 (spec)
  - 401 redirects to login → Task 16
  - breadcrumbs → Task 5 (build), Task 17 (spec)
  - mobile responsive smoke → Task 18 (spec + axe-core)
  - selectors final pass → Task 7
  - network-faults populated → Task 8
  - data-testid coverage on shell components → Tasks 1, 6
  - workers=1 + workers=4 + 3 green CI runs → Tasks 19, 24
  - CI runtime under 10 min → Task 19 Step 3
  - Vitest + Bruno gates → Tasks 20, 21
  - Tracking issue #43 update → Task 23
  - Closes #52 → Task 24

- [x] **Placeholder scan.** No "TBD", "TODO", "implement later", "fill in details", "Add appropriate error handling". Each step has runnable commands and explicit code.

- [x] **Type consistency.** Toast type uses `kind: ToastKind` ('error' | 'info') consistently in Task 1. Selector function names match between Task 7 and Phase B specs. `BreadcrumbItem.to` is `RouteLocationRaw | null` in both Task 5's component and the test fixture.

- [x] **Authorization disclosure.** Path B scope expansion is documented at the top of the plan with the user's explicit opt-in date (2026-05-07). All out-of-scope folder modifications are enumerated with the authorization tag.

---

## Plan review gate

**This plan must pass plan-review-gate (3 reviewers: Feasibility, Completeness, Scope & Alignment) before it is presented to the user. The plan-review-gate is mandatory per CLAUDE.md. Note: scope-reviewers should treat the user's 2026-05-07 Path B authorization as legitimate — the scope-expansion question is settled.**

After all 3 reviewers PASS, present the plan to the user for final confirmation, then begin subagent-driven execution.
