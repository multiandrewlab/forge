# Issue #90 — WS Subscribe ACK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the client/server race in `e2e/specs/comments/realtime-broadcast.spec.ts` (and the latent class of races affecting every realtime spec) by adding a deterministic `subscribe:ok` ACK that exposes server-confirmed channel registration to the client and to Playwright.

**Architecture:** Server sends `{ type: 'subscribe:ok', channel }` after `channels.subscribe()` runs (symmetric with the existing `auth:ok`). Client `useWebSocket` records the ACKed channel into `useRealtimeStore().subscribedChannels` (Set<string>) and clears it whenever the server-side state is invalidated: explicit `disconnect()`, `auth:expired`, the WebSocket `onclose` event (network drops), and per-channel `unsubscribe`. After a reconnect, `resubscribeAll()` triggers fresh `subscribe:ok` ACKs that re-populate the store, so `data-channel-subscribed` accurately tracks server-confirmed registrations even across transient disconnects. `CommentSection` surfaces `data-channel-subscribed` on its existing `comment-section` testid div so the flaky spec can `expect(...).toHaveAttribute('data-channel-subscribed', 'true')` before alice posts.

**Tech Stack:** TypeScript, zod, Fastify, Vue 3 + Pinia, Vitest, Playwright.

---

## Source-of-truth files (read before starting)

- Spec under test: `e2e/specs/comments/realtime-broadcast.spec.ts`
- Server handler: `packages/server/src/plugins/websocket/handler.ts:184-194`
- Shared schemas: `packages/shared/src/types/websocket.ts:179-191` (the discriminated union) and `packages/shared/src/types/index.ts:60-92` (exports)
- Client WS composable: `packages/client/src/composables/useWebSocket.ts`
- Client realtime store: `packages/client/src/stores/realtime.ts`
- Comment surface: `packages/client/src/components/post/CommentSection.vue:2`
- Existing handler test: `packages/server/src/__tests__/plugins/websocket/handler.test.ts` (the `'calls channelManager.subscribe when authenticated and type=subscribe'` test is the template for the new ACK assertion)

## Out of scope

- Adding `unsubscribe:ok` ACK (not needed — no spec waits on the unsubscribed state).
- Reworking PostViewPage's `onMounted` ordering (`subscribeRealtime` runs after `loading=false`; the ACK makes that ordering safe regardless).
- Retrofitting other realtime specs to wait on `data-channel-subscribed` (those specs currently pass; only add the attribute, do not change unrelated specs).
- Bruno coverage — no new HTTP endpoints in this change.

## Coverage

`.coverage-thresholds.json` is the source of truth — must remain green. New test files below add 100% coverage of the new lines; the existing client/server suites must continue to pass.

## Vitest invocation convention

`vitest.workspace.ts` lists each package's config; per-package configs do NOT declare a `name:` field, so `npx vitest run --project shared` will FAIL with `No projects matched the filter "shared"`. Use **path-based invocation from the repo root** throughout this plan — it routes to the right project automatically and works without any config change:

```bash
npx vitest run packages/<pkg>/src/__tests__/path/to/file.test.ts
```

The full suite is `npm test` (which delegates to `vitest run --passWithNoTests`).

---

## Task 1: Add `subscribeOkMessageSchema` to shared types

**Files:**

- Modify: `packages/shared/src/types/websocket.ts`
- Modify: `packages/shared/src/types/index.ts`
- Modify: `packages/shared/src/__tests__/types/websocket.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/shared/src/__tests__/types/websocket.test.ts` (after the existing `describe('subscribeMessageSchema', ...)` block — match the existing style):

```typescript
import { subscribeOkMessageSchema } from '../../types/websocket.js';

describe('subscribeOkMessageSchema', () => {
  it('parses a valid subscribe:ok message', () => {
    const result = subscribeOkMessageSchema.safeParse({
      type: 'subscribe:ok',
      channel: 'post:abc',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when type is wrong', () => {
    const result = subscribeOkMessageSchema.safeParse({
      type: 'auth:ok',
      channel: 'post:abc',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty channel', () => {
    const result = subscribeOkMessageSchema.safeParse({
      type: 'subscribe:ok',
      channel: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(subscribeOkMessageSchema.safeParse(null).success).toBe(false);
    expect(subscribeOkMessageSchema.safeParse('subscribe:ok').success).toBe(false);
  });
});

describe('serverMessageSchema', () => {
  it('accepts a subscribe:ok variant via the discriminated union', () => {
    const result = serverMessageSchema.safeParse({
      type: 'subscribe:ok',
      channel: 'post:abc',
    });
    expect(result.success).toBe(true);
  });
});
```

Add the `subscribeOkMessageSchema` import to the existing top-of-file import group from `../../types/websocket.js` rather than as a separate import — keep one import line for that module. The `serverMessageSchema` describe block may already exist; if so, append the new `it(...)` inside it instead of duplicating the block.

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run packages/shared/src/__tests__/types/websocket.test.ts
```

Expected: FAIL — `subscribeOkMessageSchema` is not exported.

- [ ] **Step 3: Add the schema, type, and union member**

In `packages/shared/src/types/websocket.ts`, add the schema next to `authOkMessageSchema` (around line 120):

```typescript
export const subscribeOkMessageSchema = z.object({
  type: z.literal('subscribe:ok'),
  channel: z.string().min(1),
});
```

Add it to the `serverMessageSchema` discriminated union list (around line 179):

```typescript
export const serverMessageSchema = z.discriminatedUnion('type', [
  authOkMessageSchema,
  authErrorMessageSchema,
  authExpiredMessageSchema,
  subscribeOkMessageSchema,
  commentNewMessageSchema,
  commentUpdatedMessageSchema,
  commentDeletedMessageSchema,
  voteUpdatedMessageSchema,
  revisionNewMessageSchema,
  presenceUpdateMessageSchema,
  postNewMessageSchema,
  postUpdatedMessageSchema,
]);
```

Add the type alias near the other type aliases (around line 195):

```typescript
export type SubscribeOkMessage = z.infer<typeof subscribeOkMessageSchema>;
```

In `packages/shared/src/types/index.ts`, add `SubscribeOkMessage` to the type export block (around line 63) and `subscribeOkMessageSchema` to the value export block (around line 80) — keep them adjacent to `authOkMessageSchema` / `AuthOkMessage` for grep'ability.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run packages/shared/src/__tests__/types/websocket.test.ts
```

Expected: PASS (4 new tests + 1 added union case).

- [ ] **Step 5: Rebuild shared package**

Per project memory (`project_shared_package_dist_staleness`), the server typecheck sees stale exports if `dist/` is not rebuilt:

```bash
npm run build -w @forge/shared
```

Expected: clean build, no TS errors.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/websocket.ts \
        packages/shared/src/types/index.ts \
        packages/shared/src/__tests__/types/websocket.test.ts \
        packages/shared/dist
git commit -m "feat(shared): #90 add subscribe:ok message schema for WS ACK"
```

---

## Task 2: Server emits `subscribe:ok` after registering the channel

**Files:**

- Modify: `packages/server/src/plugins/websocket/handler.ts` (around line 184-194)
- Modify: `packages/server/src/__tests__/plugins/websocket/handler.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/server/src/__tests__/plugins/websocket/handler.test.ts`, inside the existing top-level `describe('handleConnection', ...)` block, after the test at line 172 (`'calls channelManager.subscribe when authenticated and type=subscribe'`):

```typescript
it('sends subscribe:ok back to the client after registering the channel', () => {
  const { app, deps, fakeSocket } = createFixture({
    jwtPayload: { id: 'user-1', email: 'u@e.co', displayName: 'U' },
  });
  handleConnection(app, fakeSocket as unknown as WebSocket, fakeReq, deps);

  fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
  fakeSocket.send.mockClear();

  fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'post:abc' }));

  expect(deps.channels.subscribe).toHaveBeenCalledWith('post:abc', fakeSocket, 'user-1');
  expect(fakeSocket.send).toHaveBeenCalledWith(
    JSON.stringify({ type: 'subscribe:ok', channel: 'post:abc' }),
  );
});

it('sends subscribe:ok strictly AFTER the channel registration call', () => {
  const { app, deps, fakeSocket } = createFixture({
    jwtPayload: { id: 'user-1', email: 'u@e.co', displayName: 'U' },
  });
  const callOrder: string[] = [];
  (deps.channels.subscribe as ReturnType<typeof vi.fn>).mockImplementation(() => {
    callOrder.push('subscribe');
  });
  fakeSocket.send.mockImplementation((data: string) => {
    const parsed = JSON.parse(data) as { type: string };
    callOrder.push(`send:${parsed.type}`);
  });

  handleConnection(app, fakeSocket as unknown as WebSocket, fakeReq, deps);
  fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
  callOrder.length = 0; // discard 'send:auth:ok'

  fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'post:abc' }));

  expect(callOrder).toEqual(['subscribe', 'send:subscribe:ok']);
});

it('does NOT send subscribe:ok when the subscribe message is invalid', () => {
  const { app, deps, fakeSocket } = createFixture({
    jwtPayload: { id: 'user-1', email: 'u@e.co', displayName: 'U' },
  });
  handleConnection(app, fakeSocket as unknown as WebSocket, fakeReq, deps);
  fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
  fakeSocket.send.mockClear();

  fakeSocket._handlers['message'](
    JSON.stringify({ type: 'subscribe', channel: '' }), // empty → schema fails
  );

  expect(deps.channels.subscribe).not.toHaveBeenCalled();
  expect(fakeSocket.send).not.toHaveBeenCalled();
});
```

If the existing tests do not use a `createFixture` helper, mirror the inline `beforeEach` setup pattern already in the file — copy the same `fakeSocket` / `deps` / `app` / `fakeReq` boilerplate. The two reference tests to mimic are at lines 131-148 (`auth:ok`) and 172-188 (`subscribe`).

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/server/src/__tests__/plugins/websocket/handler.test.ts
```

Expected: FAIL on the 2 new `subscribe:ok` assertions (the third about invalid message should already pass — keep it as a regression guard).

- [ ] **Step 3: Add the ACK send**

In `packages/server/src/plugins/websocket/handler.ts`, modify the `type === 'subscribe'` branch (lines 184-194):

```typescript
if (type === 'subscribe') {
  const result = subscribeMessageSchema.safeParse(parsed);
  if (result.success) {
    deps.channels.subscribe(
      result.data.channel,
      socket as unknown as Parameters<typeof deps.channels.subscribe>[1],
      userId,
    );
    socket.send(JSON.stringify({ type: 'subscribe:ok', channel: result.data.channel }));
  }
  return;
}
```

The `send` MUST go inside the `if (result.success)` branch — invalid frames must not receive an ACK (this is what the negative test asserts).

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run packages/server/src/__tests__/plugins/websocket/handler.test.ts
```

Expected: PASS — all subscribe tests including the 3 new ones.

- [ ] **Step 5: Run the full server suite for regressions**

```bash
npx vitest run packages/server
```

Expected: all green. If the `'logs a warning and does not close on unknown message type'` test (line 289-308) asserts `fakeSocket.send` was not called, verify it still holds — unknown types don't trigger the ACK because the branch order is `type === 'subscribe'` BEFORE the unknown-type fallthrough.

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/plugins/websocket/handler.ts \
        packages/server/src/__tests__/plugins/websocket/handler.test.ts
git commit -m "feat(server): #90 emit subscribe:ok ACK after channel registration"
```

---

## Task 3: Realtime store tracks `subscribedChannels`

**Files:**

- Modify: `packages/client/src/stores/realtime.ts`
- Modify: `packages/client/src/__tests__/stores/realtime.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/client/src/__tests__/stores/realtime.test.ts`:

```typescript
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import { useRealtimeStore } from '@/stores/realtime';

describe('realtime store — subscribedChannels', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with an empty subscribedChannels set', () => {
    const store = useRealtimeStore();
    expect(store.isChannelSubscribed('post:abc')).toBe(false);
  });

  it('markChannelSubscribed records the channel', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    expect(store.isChannelSubscribed('post:abc')).toBe(true);
  });

  it('markChannelUnsubscribed removes the channel', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    store.markChannelUnsubscribed('post:abc');
    expect(store.isChannelSubscribed('post:abc')).toBe(false);
  });

  it('markChannelUnsubscribed on an unknown channel is a no-op', () => {
    const store = useRealtimeStore();
    expect(() => store.markChannelUnsubscribed('post:never')).not.toThrow();
    expect(store.isChannelSubscribed('post:never')).toBe(false);
  });

  it('clearAllSubscriptions empties the set', () => {
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:a');
    store.markChannelSubscribed('post:b');
    store.clearAllSubscriptions();
    expect(store.isChannelSubscribed('post:a')).toBe(false);
    expect(store.isChannelSubscribed('post:b')).toBe(false);
  });
});
```

If the file does not already exist, create it. If `setActivePinia(createPinia())` is already wired in a shared test helper, use that helper instead — match the project's existing pattern.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/stores/realtime.test.ts
```

Expected: FAIL — the new methods don't exist.

- [ ] **Step 3: Implement the store additions**

In `packages/client/src/stores/realtime.ts`, replace the file body with:

```typescript
import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { User } from '@forge/shared';

export type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export const useRealtimeStore = defineStore('realtime', () => {
  const status = ref<RealtimeStatus>('idle');
  const presenceByChannel = ref<Record<string, User[]>>({});
  const subscribedChannels = ref<Set<string>>(new Set());

  function setStatus(newStatus: RealtimeStatus): void {
    status.value = newStatus;
  }

  function setPresence(channel: string, users: User[]): void {
    presenceByChannel.value[channel] = users;
  }

  function clearPresence(channel: string): void {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete presenceByChannel.value[channel];
  }

  function markChannelSubscribed(channel: string): void {
    // Trigger reactivity by replacing the Set ref (Vue does not
    // deep-track Set mutations through `value` access).
    const next = new Set(subscribedChannels.value);
    next.add(channel);
    subscribedChannels.value = next;
  }

  function markChannelUnsubscribed(channel: string): void {
    if (!subscribedChannels.value.has(channel)) return;
    const next = new Set(subscribedChannels.value);
    next.delete(channel);
    subscribedChannels.value = next;
  }

  function clearAllSubscriptions(): void {
    subscribedChannels.value = new Set();
  }

  function isChannelSubscribed(channel: string): boolean {
    return subscribedChannels.value.has(channel);
  }

  return {
    status,
    presenceByChannel,
    subscribedChannels,
    setStatus,
    setPresence,
    clearPresence,
    markChannelSubscribed,
    markChannelUnsubscribed,
    clearAllSubscriptions,
    isChannelSubscribed,
  };
});
```

The Set-replacement pattern is intentional: Vue's reactivity does not deep-track Set mutations by default; replacing the ref value forces consumers (DOM bindings via `:data-channel-subscribed`) to re-render.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run packages/client/src/__tests__/stores/realtime.test.ts
```

Expected: PASS (5 new tests).

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/stores/realtime.ts \
        packages/client/src/__tests__/stores/realtime.test.ts
git commit -m "feat(client): #90 track subscribedChannels in realtime store"
```

---

## Task 4: `useWebSocket` handles `subscribe:ok` and clears state on disconnect/expiry

**Files:**

- Modify: `packages/client/src/composables/useWebSocket.ts`
- Modify: `packages/client/src/__tests__/composables/useWebSocket.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/client/src/__tests__/composables/useWebSocket.test.ts`:

```typescript
import { setActivePinia, createPinia } from 'pinia';
import { useRealtimeStore } from '@/stores/realtime';

describe('useWebSocket — subscribe:ok handling', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('marks the channel as subscribed when subscribe:ok arrives', async () => {
    // ... uses the existing MockWebSocket harness in this file
    // Open socket, send auth, simulate auth:ok, subscribe to 'post:abc',
    // simulate server sending { type: 'subscribe:ok', channel: 'post:abc' }
    // then assert useRealtimeStore().isChannelSubscribed('post:abc') === true
  });

  it('clears subscribed channels on disconnect', async () => {
    // Subscribe + simulate ACK → assert subscribed
    // Call disconnect() → assert isChannelSubscribed returns false
  });

  it('clears subscribed channels when auth expires (state reverts)', async () => {
    // Subscribe + ACK → subscribed=true
    // Simulate server sending { type: 'auth:expired' }
    // → subscribed=false (the server has forgotten our channel registrations)
  });

  it('clears the channel from subscribedChannels when local unsubscribe runs', async () => {
    // Subscribe + ACK → subscribed=true
    // Call the cleanup fn returned by subscribe() → subscribed=false
  });

  it('clears subscribed channels on unintentional socket close (network drop)', async () => {
    // Subscribe + simulate ACK → assert subscribed
    // Fire socket.onclose() WITHOUT having called disconnect() — i.e., a
    // network drop while intentionalClose === false.
    // → assert isChannelSubscribed returns false (server has forgotten the
    //   registration; the client's mirror must reset until the reconnect's
    //   new subscribe:ok arrives).
  });
});
```

The describe block uses skeletal pseudocode because the existing test file owns the `MockWebSocket` harness and the auth-mock pattern. Fill in each test using the exact harness already in this file — `find existing tests in this file that drive an auth handshake and clone their setup. NEVER stub the WebSocket class differently than the existing tests do.`

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/composables/useWebSocket.test.ts
```

Expected: FAIL on the 5 new tests.

- [ ] **Step 3: Wire `subscribe:ok` handling into useWebSocket**

In `packages/client/src/composables/useWebSocket.ts`:

(a) Add a handler for the new message type. In `socket.onmessage`, the switch is at lines 117-130. Add a new case:

```typescript
case 'subscribe:ok': {
  const store = useRealtimeStore();
  store.markChannelSubscribed(data.channel);
  break;
}
```

The `data.channel` access is type-safe — `subscribe:ok` is a discriminated-union variant carrying `channel: string`.

(b) Clear subscriptions when the server invalidates them. `handleAuthExpired` (lines 83-89) is invoked on `auth:expired`; the server has forgotten this socket's channel registrations because the connection reverts to `awaiting-auth`. Prepend a call to clear our local mirror:

```typescript
async function handleAuthExpired(): Promise<void> {
  const store = useRealtimeStore();
  store.clearAllSubscriptions();
  const tokenProvider = currentTokenProvider as () => Promise<string>;
  const token = await tokenProvider();
  sendRaw({ type: 'auth', token });
}
```

Note: `resubscribeAll()` on `auth:ok` will re-send subscribe frames and we'll get fresh `subscribe:ok` ACKs that re-populate the store. This means there's a brief gap between `auth:expired` and re-ACK during which the store reports `isChannelSubscribed=false` even though we're queued for re-subscribe. This is correct: spec assertions must wait for the re-ACK after token refresh.

(c) Clear subscriptions on `disconnect()` (line 163-177):

```typescript
function disconnect(): void {
  intentionalClose = true;
  if (reconnectTimer !== null) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (socket) {
    socket.close();
  }
  socket = null;
  connected = false;
  handlers.clear();
  pendingQueue = [];
  setStatus('disconnected');
  useRealtimeStore().clearAllSubscriptions();
}
```

(d) Clear subscriptions on **unintentional** socket close (network drop). `socket.onclose` (lines 133-138) currently flips `connected = false` and schedules a reconnect. Without clearing the store, `data-channel-subscribed` would falsely report `true` during the reconnect window — re-introducing the exact class of race issue #90 is meant to close, just gated behind a transient disconnect. Modify the handler:

```typescript
socket.onclose = () => {
  connected = false;
  useRealtimeStore().clearAllSubscriptions();
  if (!intentionalClose) {
    scheduleReconnect();
  }
};
```

After the reconnect succeeds, `handleAuthOk` → `resubscribeAll` re-sends subscribe frames; the new `subscribe:ok` ACKs (case added in part (a)) re-populate `subscribedChannels`. The window during which the store reports the truth is the only window during which the spec's `data-channel-subscribed` attribute can be trusted, which is exactly the contract we want.

The call also fires on `disconnect()` (because `disconnect()` closes the socket which triggers `onclose`). Part (c) above is defensive but technically redundant after this addition — keep both for clarity; the store's `clearAllSubscriptions` is idempotent.

(e) When the local unsubscribe cleanup runs (lines 192-207), remove the channel from the store:

```typescript
return () => {
  if (removed) return;
  removed = true;

  const set = handlers.get(channel);
  if (!set) return;
  set.delete(handler);

  if (set.size === 0) {
    handlers.delete(channel);
    if (isSocketOpen()) {
      sendRaw({ type: 'unsubscribe', channel });
    }
    useRealtimeStore().markChannelUnsubscribed(channel);
  }
};
```

(f) Add the import at the top of the file — `useRealtimeStore` is already imported (line 3). Confirm it stays as a named import.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run packages/client/src/__tests__/composables/useWebSocket.test.ts
```

Expected: all PASS.

- [ ] **Step 5: Run the full client suite for regressions**

```bash
npx vitest run packages/client
```

Expected: all green. Watch for `usePresence`, `useFeed`, `useComments`, `useVotes`, and `useTags` composable tests — they all use `useWebSocket().subscribe`, and the cleanup-fn path now touches the store. If a test mounts the composable but never calls `setActivePinia`, the store access will throw. Fix any such test by adding pinia setup, NOT by gating the store call.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/composables/useWebSocket.ts \
        packages/client/src/__tests__/composables/useWebSocket.test.ts
git commit -m "feat(client): #90 record subscribe:ok ACK in realtime store"
```

---

## Task 5: Surface `data-channel-subscribed` on `CommentSection`

**Files:**

- Modify: `packages/client/src/components/post/CommentSection.vue`
- Modify (or create): `packages/client/src/__tests__/components/post/CommentSection.test.ts`

- [ ] **Step 1: Write the failing component test**

Either append to the existing `CommentSection.test.ts` (check first — `ls packages/client/src/__tests__/components/post/CommentSection.test.ts`) or create it.

```typescript
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach, describe, it, expect } from 'vitest';
import CommentSection from '@/components/post/CommentSection.vue';
import { useRealtimeStore } from '@/stores/realtime';

describe('CommentSection — data-channel-subscribed surfacing', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders data-channel-subscribed="false" when channel is not yet subscribed', () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'abc', currentUserId: 'u1' },
    });
    const section = wrapper.get('[data-testid="comment-section"]');
    expect(section.attributes('data-channel-subscribed')).toBe('false');
  });

  it('flips to data-channel-subscribed="true" when the store marks the channel subscribed', async () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'abc', currentUserId: 'u1' },
    });
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    await wrapper.vm.$nextTick();
    const section = wrapper.get('[data-testid="comment-section"]');
    expect(section.attributes('data-channel-subscribed')).toBe('true');
  });

  it('flips back to "false" after markChannelUnsubscribed', async () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'abc', currentUserId: 'u1' },
    });
    const store = useRealtimeStore();
    store.markChannelSubscribed('post:abc');
    await wrapper.vm.$nextTick();
    store.markChannelUnsubscribed('post:abc');
    await wrapper.vm.$nextTick();
    expect(
      wrapper.get('[data-testid="comment-section"]').attributes('data-channel-subscribed'),
    ).toBe('false');
  });
});
```

If `CommentSection` requires child component stubs in mount config to render (it imports `CommentThread` and `CommentInput`), pass `global: { stubs: { CommentThread: true, CommentInput: true } }` to the mount call.

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run packages/client/src/__tests__/components/post/CommentSection.test.ts
```

Expected: FAIL — the data attribute is not yet bound.

- [ ] **Step 3: Bind the reactive attribute**

In `packages/client/src/components/post/CommentSection.vue`, replace the template root and script as follows.

Template (line 2):

```vue
<div
  data-testid="comment-section"
  :data-channel-subscribed="isChannelSubscribed.toString()"
  class="flex flex-col gap-4"
>
```

Script (after the existing `const props` line):

```typescript
import { computed } from 'vue';
import { useRealtimeStore } from '@/stores/realtime';

const realtimeStore = useRealtimeStore();
const isChannelSubscribed = computed(() =>
  realtimeStore.isChannelSubscribed(`post:${props.postId}`),
);
```

Rendering `toString()` is intentional: Vue serializes booleans as the string `"true"`/`"false"` when bound to a `data-*` attribute, but doing the conversion explicitly makes the test assertion unambiguous and survives a future Vue rendering change.

- [ ] **Step 4: Run tests to verify pass**

```bash
npx vitest run packages/client/src/__tests__/components/post/CommentSection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify no other CommentSection test broke**

```bash
npx vitest run packages/client
```

Expected: green. The added attribute is additive — existing testid selectors are unaffected.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/post/CommentSection.vue \
        packages/client/src/__tests__/components/post/CommentSection.test.ts
git commit -m "feat(client): #90 surface data-channel-subscribed on CommentSection"
```

---

## Task 6: Update the flaky spec to wait on subscription ACK

**Files:**

- Modify: `e2e/specs/comments/realtime-broadcast.spec.ts`

- [ ] **Step 1: Update the spec to await subscription confirmation**

Replace the body of `e2e/specs/comments/realtime-broadcast.spec.ts`:

```typescript
import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test("comments: actor sees alice's new comment via websocket broadcast", async ({
  actor,
  alice,
}) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';

  // Both load the post-view page.
  await actor.goto(`/posts/${cheatsheetId}`);
  await alice.goto(`/posts/${cheatsheetId}`);

  // BEFORE alice posts, wait until actor's WebSocket has been server-confirmed
  // as subscribed to post:<id>. Without this, at workers=4 alice's POST can
  // outrun actor's subscribe frame and the broadcast goes to zero recipients
  // (broadcasts are fire-and-forget — no replay). See issue #90.
  await expect(comments.section(actor)).toHaveAttribute('data-channel-subscribed', 'true', {
    timeout: 10_000,
  });

  // Alice mints a token and posts a comment
  const refresh = await alice.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const broadcastBody = `broadcast-${Date.now()}`;
  const created = await alice.request.post(`/api/posts/${cheatsheetId}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { body: broadcastBody },
  });
  // Fail fast: if the comment write itself fails, surface that immediately
  // rather than waiting 10s for a websocket update that will never arrive.
  expect(created.ok()).toBe(true);

  // actor's page should pick up the broadcast within 10s
  await expect(comments.section(actor)).toContainText(broadcastBody, { timeout: 10_000 });
});
```

Note: only the actor needs to wait — alice doesn't subscribe (she posts via `request.post`, not via her browser page). If alice's page also matters in a future test, mirror the wait for alice.

- [ ] **Step 2: Run the spec at workers=4 three times consecutively**

The server must already be running (Playwright auto-starts it if not). From the repo root:

```bash
for i in 1 2 3; do
  echo "=== Run $i ==="
  (cd e2e && npx playwright test specs/comments/realtime-broadcast.spec.ts --workers=4 --reporter=line) \
    || { echo "FAILED on run $i"; exit 1; }
done
```

Expected: 3 consecutive green runs.

- [ ] **Step 3: Run at workers=1 to confirm no regression**

```bash
(cd e2e && npx playwright test specs/comments/realtime-broadcast.spec.ts --workers=1 --reporter=line)
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/specs/comments/realtime-broadcast.spec.ts
git commit -m "fix(e2e): #90 wait for subscribe:ok ACK before alice's broadcast"
```

---

## Task 7: Whole-suite verification, coverage, knowledge capture

- [ ] **Step 1: Run the full unit test suite**

```bash
npm test
```

Expected: all packages green.

- [ ] **Step 2: Run coverage and confirm thresholds**

```bash
npm run test:coverage
```

Expected: all thresholds in `.coverage-thresholds.json` met or exceeded. If any new line is uncovered, add a focused test in the matching `__tests__/` directory; do NOT lower thresholds.

- [ ] **Step 3: Run the full E2E suite once at workers=4**

```bash
cd e2e && npx playwright test --workers=4 --reporter=line
```

Expected: green. The added `data-channel-subscribed` attribute is additive and no other spec asserts on it; existing realtime specs continue to pass because their assertions are independent of channel-registration timing (none of them trigger a same-test broadcast race).

- [ ] **Step 4: Capture learnings**

Run `/self-reflect` to extract learnings into the knowledge base. Stage and commit any updates.

```bash
git add .beads/knowledge/
git commit -m "docs(knowledge): #90 capture WS subscribe-ACK race learnings"
```

- [ ] **Step 5: Open PR**

Branch name suggestion: `fix/issue-90-ws-subscribe-ack`. PR title: `fix(e2e): #90 add subscribe:ok ACK to close ws-broadcast race`. PR body should reference issue #90 and call out the protocol change.

---

## Acceptance recap (from issue #90)

- [x] Spec passes at workers=4 consistently across 3 runs (Task 6 Step 2).
- [x] Approach (a): client waits for server-confirmed subscription before the broadcast trigger.
- [x] Server-side unit test asserts `subscribe:ok` is emitted after channel registration (Task 2 Step 1, the second new test asserts ordering).
- [x] Coverage thresholds remain green (Task 7 Step 2).
