# WebSocket Infrastructure & Real-Time Events Implementation Plan

> **For agentic workers:** This plan is structured as **work units** for metaswarm orchestrated execution. Each work unit has explicit DoD items, file scope, and dependencies. Use `superpowers:subagent-driven-development` OR `metaswarm:orchestrated-execution` to execute. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time communication to Forge via `@fastify/websocket`, a channel-based pub/sub system, presence tracking, and a resilient Vue composable so that comments, votes, revisions, and feed updates propagate to connected clients without page refresh.

**Architecture:**

- **Server:** Fastify plugin at `/ws`. In-memory `ConnectionManager` (per-user socket set, supports multi-tab) + `ChannelManager` (per-channel subscriber set) + `PresenceTracker` (per-channel per-user last-seen with 60s eviction). Auth handshake via first-message `auth` frame (no JWT in query string). REST mutation handlers call `channelManager.broadcast(...)` after success, excluding the sender via an `x-ws-client-id` header.
- **Client:** Singleton `useWebSocket` composable owns a shared `WebSocket` and a map of channel→handlers. Auto-reconnects with exponential backoff (1s → 30s cap) and re-authenticates + re-subscribes on reconnect. `usePresence` sends a 30s heartbeat while viewing a post. A Pinia `realtime` store holds connection status and presence state.
- **Shared:** All client↔server message types live in `packages/shared/src/types/websocket.ts` with a discriminated union on `type`.

**Tech Stack:** Fastify 5 (already in use — `packages/server/package.json` pins `fastify@^5.0.0`), `@fastify/websocket@^11` (the v11 line is Fastify-5 compatible; v10 is Fastify-4 only and would conflict with `fastify-plugin@5`), `ws`, Vue 3 Composition API, Pinia, TypeScript strict, Vitest, zod, `@fastify/jwt`.

**Issue:** `#1` — [8/19] WebSocket infrastructure & real-time events

**Coverage requirement:** 100% lines/branches/functions/statements per `.coverage-thresholds.json`.

**Branch:** `feat/websocket-realtime` (already created).

---

## File Structure

### Server (new)

| File                                                   | Responsibility                                                                                                                                                                                         |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/server/src/plugins/websocket/index.ts`       | Fastify plugin — registers `@fastify/websocket`, wires `/ws` route to handler, exposes `ChannelManager`/`ConnectionManager`/`PresenceTracker` on `app` via `app.decorate` so REST routes can broadcast |
| `packages/server/src/plugins/websocket/connections.ts` | `ConnectionManager` class — `Map<userId, Set<WebSocket>>`, add/remove/get                                                                                                                              |
| `packages/server/src/plugins/websocket/channels.ts`    | `ChannelManager` class — `Map<channel, Set<WebSocket>>`, subscribe/unsubscribe/broadcast/removeFromAll                                                                                                 |
| `packages/server/src/plugins/websocket/presence.ts`    | `PresenceTracker` class — per-channel Map, update/evict/getViewers; interval runner                                                                                                                    |
| `packages/server/src/plugins/websocket/handler.ts`     | Connection handler: auth handshake state machine, message dispatch, heartbeat, cleanup on close                                                                                                        |

### Server (modified)

| File                                     | Responsibility                                                                                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/server/src/app.ts`             | Register `websocketPlugin` after `authPlugin`                                                                                                      |
| `packages/server/src/routes/comments.ts` | After POST/PATCH/DELETE success, broadcast `comment:new`/`comment:updated`/`comment:deleted` to `post:<id>`                                        |
| `packages/server/src/routes/votes.ts`    | After vote success, broadcast `vote:updated` to `post:<id>`                                                                                        |
| `packages/server/src/routes/posts.ts`    | After POST revision success, broadcast `revision:new` to `post:<id>`; after POST/PATCH post success, broadcast `post:new`/`post:updated` to `feed` |

### Client (new)

| File                                                        | Responsibility                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `packages/client/src/composables/useWebSocket.ts`           | Singleton connection, subscribe/send/connect/disconnect, auto-reconnect, re-subscribe |
| `packages/client/src/composables/usePresence.ts`            | 30s heartbeat while viewing, exposes `viewers` ref                                    |
| `packages/client/src/stores/realtime.ts`                    | Pinia store — connection status, per-channel presence arrays                          |
| `packages/client/src/components/post/PresenceIndicator.vue` | Avatar stack of current viewers                                                       |

### Client (modified, WU-009)

| File                                             | Responsibility                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| `packages/client/src/lib/api.ts`                 | `apiFetch` wrapper — inject `x-ws-client-id` header on POST/PATCH/PUT/DELETE |
| `packages/client/src/pages/PostViewPage.vue`     | Mount `PresenceIndicator`, invoke `usePresence(postId)`                      |
| `packages/client/src/layouts/AppLayout.vue`      | Connect/disconnect WebSocket on auth state changes                           |
| `packages/client/src/composables/useComments.ts` | Subscribe to `comment:*` for the active post                                 |
| `packages/client/src/composables/useVotes.ts`    | Subscribe to `vote:updated` for the active post                              |
| `packages/client/src/composables/useFeed.ts`     | Subscribe to `feed` channel on feed view                                     |

### Shared (new)

| File                                     | Responsibility                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/types/websocket.ts` | All message schemas as discriminated-union TypeScript types, plus zod validators for server-side input |

### Shared (modified)

| File                                 | Responsibility                |
| ------------------------------------ | ----------------------------- |
| `packages/shared/src/types/index.ts` | Re-export new WebSocket types |

---

## Work Units

There are **9 work units**. Dependencies flow strictly forward. WU-001 must complete first (types are referenced everywhere). WU-002/003/004 are independent and can run in parallel. WU-005 depends on 1–4. WU-006 depends on 5. WU-007 depends on 1. WU-008 depends on 7. WU-009 depends on 5, 6, 7, 8.

```
WU-001 (shared types)
  ├── WU-002 (connections)    ┐
  ├── WU-003 (channels)       ├── WU-005 (plugin + handler) ── WU-006 (route broadcasts)
  └── WU-004 (presence)       ┘                                     │
                                                                    │
  └── WU-007 (useWebSocket) ── WU-008 (usePresence + indicator) ────┴── WU-009 (client integration + E2E)
```

---

## Chunk 1: Shared Types (WU-001)

### WU-001: Shared WebSocket Message Types

**DoD:**

1. `packages/shared/src/types/websocket.ts` exports a discriminated union `ClientMessage` covering `auth` / `subscribe` / `unsubscribe` / `presence`.
2. Same file exports discriminated union `ServerMessage` covering `auth:ok` / `auth:error` / `auth:expired` / `comment:new` / `comment:updated` / `comment:deleted` / `vote:updated` / `revision:new` / `post:new` / `post:updated` / `presence:update`.
3. Zod schemas `clientMessageSchema` and its per-variant schemas exported for server-side validation.
4. `packages/shared/src/types/index.ts` re-exports all new types.
5. 100% coverage from type-import tests that exercise each zod schema (`*.test.ts` in `packages/shared/src/__tests__/types/websocket.test.ts`).

**File scope:**

- Create: `packages/shared/src/types/websocket.ts`
- Create: `packages/shared/src/__tests__/types/websocket.test.ts`
- Modify: `packages/shared/src/types/index.ts`

**Steps:**

- [ ] **Step 1** — Write failing test `websocket.test.ts` exercising each client-variant schema (valid parse + rejection of missing fields) and asserting the type union compiles.
- [ ] **Step 2** — Run `npm test -w @forge/shared`. Expected: FAIL (`websocket.ts` not found).
- [ ] **Step 3** — Implement `websocket.ts`:
  - `AuthMessage`, `SubscribeMessage`, `UnsubscribeMessage`, `PresenceMessage` with literal `type` discriminator.
  - `ClientMessage = Auth | Subscribe | Unsubscribe | Presence`.
  - Event payload types import `Comment`, `PostWithAuthor`, `PostRevision`, `User` from their existing modules (feed items use `PostWithAuthor` from `packages/shared/src/types/feed.ts` — the project has no `PostSummary` type).
  - `ServerMessage` union covers every event listed in the issue. For `post:new` and `post:updated` feed events, payload is `PostWithAuthor`.
  - Zod schema `clientMessageSchema = z.discriminatedUnion('type', [...])`.
- [ ] **Step 4** — Add re-exports in `packages/shared/src/types/index.ts`.
- [ ] **Step 5** — Run tests, expect PASS + 100% coverage of the new file.
- [ ] **Step 6** — Commit: `feat(shared): add WebSocket message type schemas`.

---

## Chunk 2: Server Plumbing (WU-002, WU-003, WU-004)

### WU-002: ConnectionManager

**DoD:**

1. `ConnectionManager` class with `addConnection(userId, ws)`, `removeConnection(userId, ws)`, `getConnections(userId): ReadonlySet<WebSocket>`, `getAllConnections(): ReadonlyMap<string, ReadonlySet<WebSocket>>`.
2. Empty user entries pruned on last `removeConnection`.
3. 100% coverage in `packages/server/src/__tests__/plugins/websocket/connections.test.ts`.

**File scope:**

- Create: `packages/server/src/plugins/websocket/connections.ts`
- Create: `packages/server/src/__tests__/plugins/websocket/connections.test.ts`

**Steps:**

- [ ] **Step 1** — Write failing test: add two sockets for same user → `getConnections` returns both; remove one → size 1; remove last → user key gone.
- [ ] **Step 2** — Run: `npm test -w @forge/server -- connections.test`. Expect FAIL.
- [ ] **Step 3** — Implement class using `Map<string, Set<WebSocket>>`.
- [ ] **Step 4** — Run tests, expect PASS.
- [ ] **Step 5** — Commit: `feat(server): add ConnectionManager for WebSocket multi-tab support`.

### WU-003: ChannelManager

**DoD:**

1. `ChannelManager` class with `subscribe(channel, ws)`, `unsubscribe(channel, ws)`, `broadcast(channel, event: ServerMessage, excludeWs?: WebSocket)`, `getSubscribers(channel)`, `removeFromAll(ws)`.
2. `broadcast` serializes once (`JSON.stringify`) then sends to every subscriber whose `readyState === OPEN` except `excludeWs`.
3. `removeFromAll` is O(C) where C = channel count and cleans empty channels.
4. 100% coverage in `packages/server/src/__tests__/plugins/websocket/channels.test.ts` using a fake `WebSocket` (object with `readyState` + `send` spy).

**File scope:**

- Create: `packages/server/src/plugins/websocket/channels.ts`
- Create: `packages/server/src/__tests__/plugins/websocket/channels.test.ts`

**Steps:**

- [ ] **Step 1** — Write failing tests: subscribe two sockets → broadcast hits both once; exclude one → only other receives; closed socket not sent to; unsubscribe removes; `removeFromAll` sweeps every channel and drops empties.
- [ ] **Step 2** — Run, expect FAIL.
- [ ] **Step 3** — Implement class using `Map<string, Set<WebSocket>>`. `broadcast` does `const payload = JSON.stringify(event); for (const ws of set) if (ws !== excludeWs && ws.readyState === 1) ws.send(payload);`.
- [ ] **Step 4** — Tests PASS.
- [ ] **Step 5** — Commit: `feat(server): add ChannelManager for WebSocket pub/sub`.

### WU-004: PresenceTracker

**DoD:**

1. `PresenceTracker` class with `update(channel, userId, user)`, `evict(now?: number): string[]` (returns channels that lost entries), `getViewers(channel): User[]`, `remove(channel, userId)`.
2. Eviction threshold 60 seconds (constant exported for test override).
3. `createPresenceEvictionInterval(tracker, channelManager, intervalMs = 15_000)` factory returning a `NodeJS.Timer`-like handle; broadcasts `presence:update` to each affected channel; exposed for the plugin's lifecycle hooks.
4. 100% coverage in `packages/server/src/__tests__/plugins/websocket/presence.test.ts` using fake time (`vi.useFakeTimers()`).

**File scope:**

- Create: `packages/server/src/plugins/websocket/presence.ts`
- Create: `packages/server/src/__tests__/plugins/websocket/presence.test.ts`

**Steps:**

- [ ] **Step 1** — Write failing tests: `update` then `getViewers` returns the user; advance 61s + `evict()` returns the channel and `getViewers` is empty; interval factory schedules and clears correctly; broadcast payload shape matches `presence:update` type.
- [ ] **Step 2** — Run, expect FAIL.
- [ ] **Step 3** — Implement using `Map<channel, Map<userId, { user: User; lastSeen: number }>>`. Use `Date.now()` (overridable via parameter) for `lastSeen`.
- [ ] **Step 4** — Tests PASS.
- [ ] **Step 5** — Commit: `feat(server): add PresenceTracker with eviction interval`.

---

## Chunk 3: Plugin & Handler (WU-005)

### WU-005: WebSocket Plugin & Auth Handshake Handler

**DoD:**

1. `@fastify/websocket` added to `packages/server/package.json` dependencies, pinned to `^11` (the Fastify-5-compatible line; v10 targets Fastify 4 and would conflict with `fastify-plugin@5` used throughout this repo).
2. `packages/server/src/plugins/websocket/handler.ts` exports `handleConnection(app, connection, req, deps)` with connection state machine:
   - initial state `awaiting-auth`; only `auth` messages accepted; everything else closed with code `4001` and reason `"auth-required"`.
   - On valid JWT: state `authenticated`, send `{ type: 'auth:ok' }`, add to `ConnectionManager`.
   - On invalid/expired JWT: send `{ type: 'auth:error', reason }` then close with code `4002`.
   - While authenticated: `subscribe` / `unsubscribe` / `presence` dispatched to managers; unknown types ignored with a warning log.
   - On JWT expiry detected mid-session (checked on every incoming frame): send `{ type: 'auth:expired' }`, clear authenticated state, require re-auth.
   - On socket `close`: `channelManager.removeFromAll(ws)` + `connectionManager.removeConnection(userId, ws)`.
3. `packages/server/src/plugins/websocket/index.ts` registers `@fastify/websocket`, builds the three managers, decorates `app` with `app.websocket = { connections, channels, presence }`, attaches `/ws` route, and starts the presence eviction interval (cleared on `app.addHook('onClose', ...)`).
4. 100% coverage in `packages/server/src/__tests__/plugins/websocket/handler.test.ts` and `index.test.ts`, exercising every branch (pre-auth reject, bad JSON, auth ok, auth bad-token, subscribe, unsubscribe, presence update, token-expired-midway, close cleanup).
5. **Boot resilience smoke test**: `packages/server/src/__tests__/app.test.ts` (new — if not already present) asserts `buildApp()` returns successfully with the WebSocket plugin registered and `app.websocket.channels` / `app.websocket.connections` / `app.websocket.presence` decorations are available. This guards against startup regressions if the plugin's registration contract changes.

**File scope:**

- Create: `packages/server/src/plugins/websocket/handler.ts`
- Create: `packages/server/src/plugins/websocket/index.ts`
- Create: `packages/server/src/__tests__/plugins/websocket/handler.test.ts`
- Create: `packages/server/src/__tests__/plugins/websocket/index.test.ts`
- Create or modify: `packages/server/src/__tests__/app.test.ts` (boot-smoke test)
- Modify: `packages/server/package.json` (add dep)
- Modify: `packages/server/src/app.ts` (register plugin after `authPlugin`)

**Steps:**

- [ ] **Step 1** — `cd packages/server && npm i @fastify/websocket@^11` (v11 is the Fastify-5-compatible line; v10 targets Fastify 4 and would conflict with `fastify-plugin@5`). Commit lockfile alone: `chore(server): add @fastify/websocket dependency`.
- [ ] **Step 2** — Write failing handler tests using `fastify.inject`-compatible WebSocket pattern OR a bare test harness: instantiate fake `SocketStream`-like `connection` with `{ socket: FakeWS }` and call `handleConnection` directly. Cover every DoD branch.
- [ ] **Step 3** — Run, expect FAIL (module missing).
- [ ] **Step 4** — Implement `handler.ts`:
  - Accept `deps: { jwt: FastifyInstance['jwt']; connections; channels; presence }`.
  - On each `message` event: `JSON.parse` inside try/catch — on parse error send `auth:error`/no-op (design: log + ignore to avoid oracle).
  - Validate each parsed object with the variant zod schema (from WU-001) before acting.
- [ ] **Step 5** — Implement `index.ts` plugin (fastify-plugin wrapped):
  - `await app.register(websocketPlugin)` (from `@fastify/websocket`).
  - Build managers; `app.decorate('websocket', { ... })`; declare module augmentation.
  - `app.get('/ws', { websocket: true }, (connection, req) => handleConnection(app, connection, req, deps))`.
  - `const stopEviction = createPresenceEvictionInterval(presence, channels);`
  - `app.addHook('onClose', async () => { clearInterval(stopEviction); })`.
- [ ] **Step 6** — Register in `app.ts`: `await app.register(websocketPlugin);` between `authPlugin` and `healthRoutes`.
- [ ] **Step 7** — Add/update `app.test.ts` boot-smoke test: `const app = await buildApp(); expect(app.websocket?.channels).toBeDefined(); expect(app.websocket?.connections).toBeDefined(); expect(app.websocket?.presence).toBeDefined(); await app.close();`.
- [ ] **Step 8** — Run full server test suite + coverage — expect PASS @ 100%.
- [ ] **Step 9** — Commit: `feat(server): add WebSocket plugin with auth handshake`.

---

## Chunk 4: REST → WebSocket Broadcast Wiring (WU-006)

### WU-006: Route Broadcast Integration

**DoD:**

1. Every mutation route calls `app.websocket.channels.broadcast(channel, event, excludeWs)` after the DB write succeeds.
2. Sender exclusion uses the `x-ws-client-id` header sent by the client. The server maps that ID → `WebSocket` via a new `ConnectionManager.findByClientId(clientId)` method (the handshake assigns each socket a `clientId` on connect and indexes it).
3. Routes updated:
   - `comments.ts` POST → `comment:new`, PATCH → `comment:updated`, DELETE → `comment:deleted` (payload: `{ id }`).
   - `votes.ts` POST → `vote:updated` with `{ voteCount }`.
   - `posts.ts` POST revision → `revision:new`; POST post → `post:new` on `feed`; PATCH post → `post:updated` on `feed`.
4. Existing route tests still pass. New tests assert `channels.broadcast` is called with the correct channel + event shape + exclude arg. Use a mock `WebSocketRegistry` object injected via `buildApp({ websocket: mockRegistry })` OR by reading `app.websocket.channels` and spying on `broadcast`.
5. 100% coverage preserved.

**File scope:**

- Modify: `packages/server/src/plugins/websocket/connections.ts` (add `registerClientId` / `findByClientId`)
- Modify: `packages/server/src/plugins/websocket/handler.ts` (assign clientId on auth-ok; include in close cleanup)
- Modify: `packages/server/src/routes/comments.ts`
- Modify: `packages/server/src/routes/votes.ts`
- Modify: `packages/server/src/routes/posts.ts`
- Modify/Create tests: `packages/server/src/__tests__/routes/{comments,votes,posts}.test.ts` — add broadcast-assertion cases

**Steps:**

- [ ] **Step 1** — Write failing tests: existing integration tests wired to a spy on `app.websocket.channels.broadcast` assert it is called with the expected payload and the excluded `ws` is the one whose `clientId === request.headers['x-ws-client-id']`.
- [ ] **Step 2** — Run, expect FAIL (routes don't broadcast yet).
- [ ] **Step 3** — Extend `ConnectionManager` with a `clientId → ws` index. Update handler to assign a UUID on `auth:ok` (store on the `ws` object as a non-enumerable symbol property `Symbol.for('forge.clientId')`) and register it.
- [ ] **Step 4** — In each route, after success: read `const clientId = request.headers['x-ws-client-id'] as string | undefined; const excludeWs = clientId ? app.websocket.connections.findByClientId(clientId) : undefined; app.websocket.channels.broadcast('post:' + id, event, excludeWs);`
- [ ] **Step 5** — Run coverage — expect PASS @ 100%.
- [ ] **Step 6** — Run Bruno against live server for `comments/`, `votes/`, `posts/revisions/` — expect all requests 2xx.
- [ ] **Step 7** — Commit: `feat(server): broadcast REST mutations over WebSocket`.

---

## Chunk 5: Client Core (WU-007)

### WU-007: `useWebSocket` Composable + Realtime Store

**DoD:**

1. `packages/client/src/stores/realtime.ts` (Pinia) holds `status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'` and `presenceByChannel: Record<string, User[]>`.
2. `useWebSocket` is a module-level singleton (not a factory) exporting:
   - `subscribe(channel, handler): () => void` — returns cleanup fn.
   - `send(message: ClientMessage): void` — queued if not `connected`.
   - `connect(tokenProvider: () => Promise<string>): void`, `disconnect(): void`.
   - `clientId: string` (UUID generated on first construction).
3. Auto-reconnect: `1s, 2s, 4s, 8s, 16s, 30s` capped at 30s, reset on `connected`.
4. On reconnect: re-send `auth`; after `auth:ok`, re-send `subscribe` for every channel currently held in the handler map.
5. On `auth:expired`: call `tokenProvider()` again and re-auth without resetting channel subscriptions.
6. Dispatches incoming server messages to every registered handler for `message.channel`. Channel-less messages (`auth:*`) handled internally.
7. 100% coverage in `packages/client/src/__tests__/composables/useWebSocket.test.ts` and `stores/realtime.test.ts`, using a fake `WebSocket` class (`vi.stubGlobal('WebSocket', FakeWebSocket)`).

**File scope:**

- Create: `packages/client/src/composables/useWebSocket.ts`
- Create: `packages/client/src/stores/realtime.ts`
- Create: `packages/client/src/__tests__/composables/useWebSocket.test.ts`
- Create: `packages/client/src/__tests__/stores/realtime.test.ts`

**Steps:**

- [ ] **Step 1** — Write failing tests. Scenarios:
  - Connect → fake `open` → handler sent `auth` with token from provider → fake `auth:ok` → status `connected`.
  - Subscribe to two channels → `subscribe` messages sent → incoming `comment:new` routed to the right handler only.
  - Fake `close` → status `reconnecting` → advance timers 1000ms → `WebSocket` constructed again → on open, re-auth + re-subscribe.
  - Backoff caps at 30s after 6 attempts.
  - `auth:expired` → token provider re-called, channels NOT dropped.
- [ ] **Step 2** — Run, expect FAIL.
- [ ] **Step 3** — Implement composable. Key invariants:
  - `WS_URL` read from `import.meta.env.VITE_WS_URL` with fallback to `window.location.host`.
  - Internal state is module-scoped (one connection per app load).
  - `x-ws-client-id` must be propagated to REST calls — export `clientId` so `fetch` wrappers can inject it (next WU).
- [ ] **Step 4** — Implement `stores/realtime.ts` as a plain Pinia store; `useWebSocket` writes into it.
- [ ] **Step 5** — Coverage PASS.
- [ ] **Step 6** — Commit: `feat(client): add useWebSocket composable and realtime store`.

---

## Chunk 6: Presence UI (WU-008)

### WU-008: `usePresence` + `PresenceIndicator.vue`

**DoD:**

1. `usePresence(postId: Ref<string>)` sends `{ type: 'presence', channel: 'post:<id>', status: 'viewing' }` every 30s while the component is mounted AND the postId changes or becomes truthy; stops on unmount.
2. Subscribes to `presence:update` on the same channel and writes `event.data.users` into `realtime.presenceByChannel[channel]`.
3. Exposes `viewers: ComputedRef<User[]>`.
4. `PresenceIndicator.vue` displays up to 5 avatars (`UserAvatar` component if present, else `<img>`) + `+N` overflow badge. Hidden when `viewers.length === 0`.
5. 100% coverage — composable test exercises mount/unmount/timer/response handling; component test (`@vue/test-utils`) exercises 0/3/8 viewers rendering.

**File scope:**

- Create: `packages/client/src/composables/usePresence.ts`
- Create: `packages/client/src/components/post/PresenceIndicator.vue`
- Create: `packages/client/src/__tests__/composables/usePresence.test.ts`
- Create: `packages/client/src/__tests__/components/post/PresenceIndicator.test.ts`

**Steps:**

- [ ] **Step 1** — Write failing composable test (fake timers: assert heartbeat sent at t=0 and every 30s; stop after unmount).
- [ ] **Step 2** — Write failing component test (mount with 0 viewers → not rendered; 3 → 3 avatars; 8 → 5 avatars + `+3`).
- [ ] **Step 3** — Run, expect FAIL.
- [ ] **Step 4** — Implement composable using `onMounted` / `onUnmounted` / `watch(postId, ...)` / `setInterval`.
- [ ] **Step 5** — Implement `PresenceIndicator.vue` using Tailwind classes consistent with existing avatar stacks (search project for the pattern first — if none, use `ring-2 ring-white -ml-2`).
- [ ] **Step 6** — Coverage PASS.
- [ ] **Step 7** — Commit: `feat(client): add usePresence composable and PresenceIndicator`.

---

## Chunk 7: Client Integration & E2E (WU-009)

### WU-009: Wire Up Stores, Views, and REST Client

**DoD:**

1. `packages/client/src/composables/useComments.ts`: on mount subscribes to `comment:*` events on `post:<id>` and mutates the comments store in place (insert/update/remove).
2. `packages/client/src/composables/useVotes.ts`: subscribes to `vote:updated` and updates post `voteCount`.
3. `packages/client/src/composables/usePosts.ts` or `useFeed.ts`: subscribes to `feed` channel on feed views for `post:new` / `post:updated` and prepends/updates the feed store list.
4. REST fetch wrapper (existing — likely `packages/client/src/lib/api.ts` or inline in composables) includes header `x-ws-client-id: <clientId>` on every mutating call (POST/PATCH/DELETE).
5. Post detail view mounts `PresenceIndicator` and invokes `usePresence(postId)`.
6. App root (`App.vue` or main layout) calls `useWebSocket().connect(authStore.getAccessToken)` once after auth is established; calls `disconnect()` on logout.
7. **Composable API is strictly additive.** All modifications to `useComments.ts`, `useVotes.ts`, `useFeed.ts`, and `usePosts.ts` consist only of:
   - Adding `onMounted` blocks that call `useWebSocket().subscribe(...)` and push mutations into existing store refs.
   - Adding `onUnmounted` blocks that invoke the cleanup function returned by `subscribe`.
     No existing exported symbols are renamed, removed, or signature-changed. No existing return shapes change. Therefore every current consumer of these composables — including `CommentThread.vue`, `CommentSection.vue`, `PostActions.vue`, `HomePage.vue`, `TheSidebar.vue`, `PostEditPage.vue`, `PostNewPage.vue`, `PostViewPage.vue` — continues to work without modification. This invariant is verified by running the full existing client test suite (step 8 below) and confirming no existing component test needs updating.
8. Existing tests still pass (enforced by the full-suite run). New tests cover each store-integration path with a fake `useWebSocket` dispatcher.
9. 100% coverage preserved.
10. **Manual verification**: start dev server, open two browser tabs logged in as different users, confirm comment/vote/presence flow works end-to-end.

**File scope:**

- Modify: `packages/client/src/composables/useComments.ts`
- Modify: `packages/client/src/composables/useVotes.ts`
- Modify: `packages/client/src/composables/useFeed.ts` (or `usePosts.ts` — pick the feed-view one; verified both exist)
- Modify: `packages/client/src/lib/api.ts` (centralized `apiFetch` wrapper — inject `x-ws-client-id` header on mutating calls)
- Modify: `packages/client/src/pages/PostViewPage.vue` (the post detail page — codebase uses `pages/`, not `views/`)
- Modify: `packages/client/src/layouts/AppLayout.vue` (the real app shell — `App.vue` is just `<RouterView />`; the shell with auth lifecycle hooks is `AppLayout.vue`)
- Modify tests: every composable test gets WebSocket-dispatch coverage; add a test for `apiFetch` asserting the header is included on POST/PATCH/DELETE and omitted on GET

**Steps:**

- [ ] **Step 1** — Verify file scope before coding: confirm `packages/client/src/lib/api.ts` still owns `apiFetch` and that `pages/PostViewPage.vue` / `layouts/AppLayout.vue` are still the right targets. If any of these has moved or been renamed since this plan was approved, note the drift and update the plan BEFORE changing code.
- [ ] **Step 2** — Write failing tests for each composable: given fake incoming `comment:new` for the current post → comment appears in the store; `comment:deleted` → removed; `vote:updated` → voteCount updated; `post:new` on feed view → prepended.
- [ ] **Step 3** — Run, expect FAIL.
- [ ] **Step 4** — Implement subscription wiring inside each composable's `onMounted` / `watch` setup. Use `useWebSocket().subscribe(channel, handler)` and return cleanup via `onUnmounted`.
- [ ] **Step 5** — Thread `x-ws-client-id` through `lib/api.ts` (`apiFetch`) — injected only on mutating methods (POST/PATCH/PUT/DELETE).
- [ ] **Step 6** — Mount `PresenceIndicator` in `pages/PostViewPage.vue` and invoke `usePresence(postId)` there.
- [ ] **Step 7** — Wire `connect`/`disconnect` into `layouts/AppLayout.vue` (watch auth store: on login → connect; on logout → disconnect).
- [ ] **Step 8** — Run full test suite + coverage (client + server + shared). Expect PASS @ 100%.
- [ ] **Step 9** — Start dev server (`set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts` in one terminal; `cd packages/client && npm run dev` in another) and manually verify two-tab flow: comments/votes/presence.
- [ ] **Step 10** — Run Bruno suite end-to-end: `cd bruno && npx @usebruno/cli run -r --env local`. All must pass.
- [ ] **Step 11** — Commit: `feat(client): wire real-time events into comments, votes, feed, and presence`.

---

## Final Review Checklist (after all work units)

- [ ] All DoD items for all 9 work units verified green.
- [ ] `npm run test:coverage` in every package → 100% lines/branches/functions/statements.
- [ ] `npm run lint`, `npm run build`, `npm run typecheck` all pass.
- [ ] Bruno full run (`bruno && npx @usebruno/cli run -r --env local`) — all 2xx.
- [ ] Manual two-tab verification performed and screenshots attached to PR.
- [ ] `/self-reflect` run and knowledge base updates committed.
- [ ] PR opened against `main`.

---

## Design Decisions

### Sender exclusion via `x-ws-client-id` header

The issue text suggested attaching the user's current WebSocket to the request during auth. That's only workable if the REST call came through the same underlying TCP connection as the WebSocket — it did not. Instead:

- Handshake assigns each socket a `clientId` (UUID) on `auth:ok`.
- Client composable exposes `clientId` and the fetch wrapper injects `x-ws-client-id` on every mutating REST call.
- Server route looks up the socket by `clientId` and passes it as `excludeWs` to `broadcast`.

This keeps sender exclusion scoped to _this tab_ — other tabs of the same user still receive the broadcast, so they stay in sync.

### In-memory (no Redis)

The issue explicitly scopes this as in-memory. No multi-instance horizontal scaling until a future issue upgrades to Redis pub/sub. This plan does NOT add Redis.

### Bruno exemption for the `/ws` WebSocket endpoint

CLAUDE.md requires Bruno `.bru` files for every new/modified endpoint. The `/ws` endpoint is new, but **Bruno CLI is HTTP-only and cannot drive WebSocket frame-level interaction** (no support for sending `auth`/`subscribe` JSON frames, no way to assert on `auth:ok`/`presence:update` responses). A plain HTTP GET against `/ws` returns `400 Bad Request` (missing Upgrade header) and tells us nothing about the real protocol.

Therefore this plan:

- Does **not** add `bruno/websocket/*.bru` files for the WebSocket handshake.
- **Does** run the existing Bruno collection for `comments/`, `votes/`, `posts/` after WU-006 broadcast wiring to confirm no REST regressions.
- Relies on server-side handler tests (WU-005) and client-side composable tests (WU-007, WU-008) plus the manual two-tab verification in WU-009 Step 9 for end-to-end WebSocket correctness.

This is an explicit documented exemption, not a silent omission.

### Zod for server-side validation only

Client-emitted messages are validated with zod schemas on the server. Server-emitted messages are trusted on the client (typed via shared TS union). This mirrors the existing pattern in the codebase — REST route handlers use `safeParse` but response types are plain TS.

---

## Known Gotchas Referenced

- Coverage enforcement: `.coverage-thresholds.json` set to 100% on every metric — see repo root.
- TS monorepo: base `tsconfig` uses ESNext/Bundler; server overrides to NodeNext — any new `import` from `@forge/shared` must use explicit `.js` file extension in server code.
- No non-null assertions (`!`) per lint rules — cast with `as Type` where needed.
- Never use `--no-verify` on git commits.
