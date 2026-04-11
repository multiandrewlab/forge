# Forge: Internal Developer Knowledge-Sharing Platform — Design Spec

## Overview

Forge is a centralized internal platform for developers to share knowledge, code snippets, prompts, and files. It combines the discoverability of Hacker News with the utility of GitHub Gists and AI-assisted authoring, built as a modern, developer-centric experience.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS, PrimeVue (frontend) | Fastify, TypeScript, PostgreSQL (backend) | Docker Compose (local dev)

## Architecture: Monorepo, Minimal Infrastructure

Single repository with npm workspaces. Three packages: `client` (Vue 3 + Vite), `server` (Fastify), `shared` (TypeScript types + Zod validators). No ORM — raw SQL with typed query functions. `node-pg-migrate` for migrations.

Docker Compose runs: PostgreSQL, MinIO (S3-compatible file storage), Ollama (local LLM with gemma4 model), client dev server, and Fastify server.

### Project Structure

```
forge/
├── packages/
│   ├── client/                  # Vue 3 + Vite
│   │   ├── src/
│   │   │   ├── assets/
│   │   │   ├── components/      # Shared UI components
│   │   │   ├── composables/     # Vue composables (useAuth, useWebSocket, useSearch...)
│   │   │   ├── layouts/         # App shell, sidebar layout
│   │   │   ├── pages/           # Route-level views (Home, Edit, History, Search)
│   │   │   ├── stores/          # Pinia stores (auth, posts, realtime)
│   │   │   ├── plugins/         # PrimeVue, router, websocket setup
│   │   │   └── App.vue
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── tailwind.config.ts
│   │   └── tsconfig.json
│   │
│   ├── server/                  # Fastify
│   │   ├── src/
│   │   │   ├── plugins/         # Fastify plugins (auth, db, websocket, langchain)
│   │   │   ├── routes/          # Route handlers grouped by domain
│   │   │   ├── services/        # Business logic layer
│   │   │   ├── db/
│   │   │   │   ├── migrations/  # SQL migrations (node-pg-migrate)
│   │   │   │   └── queries/     # Typed query functions
│   │   │   └── app.ts
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── shared/                  # Shared types & validators
│       ├── src/
│       │   ├── types/           # TypeScript interfaces (Post, User, Tag, etc.)
│       │   ├── validators/      # Zod schemas (shared validation frontend + backend)
│       │   └── constants/       # Shared enums, config constants
│       ├── tsconfig.json
│       └── package.json
│
├── docker/
│   ├── Dockerfile.client
│   ├── Dockerfile.server
│   └── init-db.sql              # PostgreSQL init script
│
├── docker-compose.yml           # PostgreSQL, MinIO, Ollama, client, server
├── package.json                 # Workspace root (npm workspaces)
├── tsconfig.base.json           # Shared TS config
└── .env.example
```

## Data Model

### Users

```sql
users
├── id              UUID PRIMARY KEY
├── email           VARCHAR UNIQUE NOT NULL
├── display_name    VARCHAR NOT NULL
├── avatar_url      VARCHAR
├── auth_provider   VARCHAR NOT NULL  -- 'google' | 'local'
├── password_hash   VARCHAR           -- NULL for SSO users; bcrypt (cost >= 12) or Argon2id
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

### Posts

Single `posts` table with `content_type` discriminator (`'snippet' | 'prompt' | 'document' | 'link'`) — keeps queries simple and the feed unified.

```sql
posts
├── id              UUID PRIMARY KEY
├── author_id       UUID → users ON DELETE CASCADE
├── title           VARCHAR NOT NULL
├── content_type    VARCHAR NOT NULL  -- 'snippet' | 'prompt' | 'document' | 'link'
├── language        VARCHAR           -- programming language (for snippets)
├── visibility      VARCHAR NOT NULL  -- 'public' | 'private'
├── is_draft        BOOLEAN DEFAULT true
├── forked_from_id  UUID → posts ON DELETE SET NULL  -- NULL if original
├── link_url        VARCHAR           -- URL for content_type='link'
├── link_preview     JSONB            -- { title, description, image, reading_time } for links
├── vote_count      INT DEFAULT 0     -- denormalized, updated via trigger on votes
├── view_count      INT DEFAULT 0
├── search_vector   tsvector          -- auto-updated via trigger
├── deleted_at      TIMESTAMPTZ       -- soft delete (NULL = active)
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ
```

### Revisions

Revisions store full content, not diffs. Storage is cheap; complexity isn't. Diffs are computed on read.

```sql
post_revisions
├── id              UUID PRIMARY KEY
├── post_id         UUID → posts ON DELETE CASCADE
├── author_id       UUID → users ON DELETE SET NULL
├── content         TEXT NOT NULL      -- full content at this revision
├── message         VARCHAR           -- commit message ("Added null check")
├── revision_number INT NOT NULL
├── created_at      TIMESTAMPTZ
└── UNIQUE(post_id, revision_number)
```

### Post Files (multi-file grouping)

```sql
post_files
├── id              UUID PRIMARY KEY
├── post_id         UUID → posts ON DELETE CASCADE
├── revision_id     UUID → post_revisions ON DELETE CASCADE  -- snapshot per revision
├── filename        VARCHAR NOT NULL
├── content         TEXT              -- inline content (small files)
├── storage_key     VARCHAR           -- MinIO key (large files)
├── mime_type       VARCHAR
├── sort_order      INT DEFAULT 0
├── created_at      TIMESTAMPTZ
└── CONSTRAINT file_size CHECK (octet_length(content) <= 10485760)  -- 10 MB inline limit

-- File upload constraints:
-- Max file size: 10 MB (enforced server-side, returned as HTTP 413)
-- Allowed MIME types: text/*, application/json, application/yaml, image/* (returned as HTTP 415)
-- Storage: files <= 64 KB stored inline in content; larger files stored in MinIO via storage_key
```

### Tags

```sql
tags
├── id              UUID PRIMARY KEY
├── name            VARCHAR UNIQUE NOT NULL
└── post_count      INT DEFAULT 0     -- denormalized, updated via trigger on post_tags changes

-- Trigger: on INSERT/DELETE to post_tags, increment/decrement tags.post_count.
-- Also fires on posts.deleted_at change (soft delete) and posts.visibility change to
-- keep count accurate for public, non-deleted posts only.

post_tags
├── post_id         UUID → posts ON DELETE CASCADE
└── tag_id          UUID → tags ON DELETE CASCADE
    PRIMARY KEY (post_id, tag_id)
```

### Votes & Bookmarks

```sql
votes
├── user_id         UUID → users ON DELETE CASCADE
├── post_id         UUID → posts ON DELETE CASCADE
├── value           SMALLINT NOT NULL CHECK (value IN (1, -1))
    PRIMARY KEY (user_id, post_id)

bookmarks
├── user_id         UUID → users ON DELETE CASCADE
├── post_id         UUID → posts ON DELETE CASCADE
├── created_at      TIMESTAMPTZ
    PRIMARY KEY (user_id, post_id)
```

### Tag Subscriptions

```sql
user_tag_subscriptions
├── user_id         UUID → users ON DELETE CASCADE
├── tag_id          UUID → tags ON DELETE CASCADE
    PRIMARY KEY (user_id, tag_id)
```

### Comments

Inline comments anchor to a specific revision so they don't break when content changes.

```sql
comments
├── id              UUID PRIMARY KEY
├── post_id         UUID → posts ON DELETE CASCADE
├── author_id       UUID → users ON DELETE SET NULL
├── parent_id       UUID → comments ON DELETE CASCADE  -- deleting parent cascades to children
├── line_number     INT               -- NULL for general comments, set for inline
├── revision_id     UUID → post_revisions ON DELETE SET NULL -- anchors inline comment to specific revision
├── body            TEXT NOT NULL
├── created_at      TIMESTAMPTZ
└── updated_at      TIMESTAMPTZ

-- Inline comment display policy:
-- Comments on the CURRENT revision: shown inline at line_number
-- Comments on OLDER revisions: shown in a "Previous comments" section below current
--   inline comments, with "Left on revision N" indicator and link to that revision
-- When a revision is restored, comments on the now-current revision become inline again
-- GET /api/posts/:id/comments accepts ?revision=<id> to filter by specific revision
```

### Prompt Variables

```sql
prompt_variables
├── id              UUID PRIMARY KEY
├── post_id         UUID → posts ON DELETE CASCADE
├── name            VARCHAR NOT NULL   -- e.g. "Error Log"
├── placeholder     VARCHAR           -- e.g. "Insert Error Log Here"
├── sort_order      INT DEFAULT 0
├── default_value   TEXT
└── UNIQUE(post_id, name)
```

## API Design

### REST API Routes

```
Authentication
├── POST   /api/auth/login            # Email/password login
├── POST   /api/auth/register         # Email/password registration
├── GET    /api/auth/google           # Google OAuth redirect
├── GET    /api/auth/google/callback  # Google OAuth callback
├── POST   /api/auth/logout
├── GET    /api/auth/me               # Current user profile
└── PATCH  /api/auth/me               # Update profile

Posts
├── GET    /api/posts                 # List/feed (?sort=trending|recent|top|personalized&tag=X&type=snippet)
├── POST   /api/posts                 # Create post
├── GET    /api/posts/:id             # Get post with latest revision
├── PATCH  /api/posts/:id             # Update metadata (title, visibility, tags)
├── DELETE /api/posts/:id             # Soft delete
├── POST   /api/posts/:id/publish     # Publish draft
├── POST   /api/posts/:id/fork        # Fork a post
├── GET    /api/posts/:id/revisions           # List revision history
├── GET    /api/posts/:id/revisions/:rev      # Get specific revision
├── POST   /api/posts/:id/revisions           # Create new revision (save)
├── POST   /api/posts/:id/revisions/:rev/restore  # Restore to revision
├── GET    /api/posts/:id/files       # List attached files
├── POST   /api/posts/:id/files       # Upload file
└── DELETE /api/posts/:id/files/:fileId

Voting & Bookmarks
├── POST   /api/posts/:id/vote        # { value: 1 | -1 } — idempotent toggle
├── DELETE /api/posts/:id/vote        # Remove vote
├── POST   /api/posts/:id/bookmark    # Toggle bookmark
└── GET    /api/bookmarks             # List user's bookmarks

Comments
├── GET    /api/posts/:id/comments          # List comments (threaded)
├── POST   /api/posts/:id/comments          # Create comment
├── PATCH  /api/posts/:id/comments/:cid     # Edit comment
└── DELETE /api/posts/:id/comments/:cid

Tags
├── GET    /api/tags                  # List tags (with post counts)
├── GET    /api/tags/popular          # Trending tags
├── POST   /api/tags/:id/subscribe    # Subscribe to tag
└── DELETE /api/tags/:id/subscribe    # Unsubscribe

Search
└── GET    /api/search                # ?q=term&type=snippet|prompt&tag=X&fuzzy=true

AI
├── POST   /api/ai/complete           # Autocomplete (streaming SSE)
├── POST   /api/ai/generate           # Generate content (streaming SSE)
└── POST   /api/ai/search             # AI-powered search query interpretation

Users
└── GET    /api/users/:id             # Public profile (posts, stats)

Prompt Playground
├── POST   /api/playground/run        # Execute prompt with variables (streaming SSE)
└── GET    /api/posts/:id/variables   # Get prompt template variables
```

### WebSocket Events

Single WebSocket connection per client at `/ws`, multiplexed by channel.

```
Client → Server
├── { type: "subscribe",   channel: "post:<id>" }
├── { type: "subscribe",   channel: "feed" }
├── { type: "unsubscribe", channel: "post:<id>" }
└── { type: "presence",    channel: "post:<id>", status: "viewing" }

Server → Client
├── { type: "comment:new",      channel: "post:<id>", data: Comment }
├── { type: "comment:updated",  channel: "post:<id>", data: Comment }
├── { type: "comment:deleted",  channel: "post:<id>", data: { id } }
├── { type: "revision:new",     channel: "post:<id>", data: Revision }
├── { type: "vote:updated",     channel: "post:<id>", data: { vote_count } }
├── { type: "presence:update",  channel: "post:<id>", data: { users: User[] } }
├── { type: "post:new",         channel: "feed",      data: PostSummary }
└── { type: "post:updated",     channel: "feed",      data: PostSummary }
```

**Auth:** JWT via auth handshake message (NOT query params — query params leak tokens into logs). On connect, the client sends `{ type: "auth", token: "<jwt>" }` as the first message. The server validates the token and either confirms with `{ type: "auth:ok" }` or closes the connection with `{ type: "auth:error", reason: "..." }`. No other messages are processed until auth succeeds. On token expiry during an active connection, the server sends `{ type: "auth:expired" }` and the client must re-authenticate with a refreshed token before resuming.

**AI endpoints use SSE**, not WebSocket — SSE is the standard for LLM streaming, simpler than multiplexing AI streams over the WS connection.

## Frontend Architecture

### Routing

```
/                    → Home feed (trending/recent/personalized)
/trending            → Trending posts
/my-snippets         → Current user's posts
/bookmarks           → Bookmarked posts
/post/new            → Editor (create)
/post/:id            → Post detail view
/post/:id/edit       → Editor (edit existing)
/post/:id/history    → Revision history + diff viewer
/search              → Full search results page
/user/:id            → Public user profile
/login               → Auth page
/playground/:id      → Prompt playground
```

### Layout

Three-panel layout matching the UI designs: collapsible sidebar (nav + followed tags), scrollable post list, and post detail panel. `AppLayout.vue` wraps everything; `AuthLayout.vue` for login/register.

### Key Components

```
Layouts:         AppLayout, AuthLayout
Shell:           TheSidebar, TheTopBar, TheSearchModal, UserAvatar
Post List:       PostList, PostListItem, PostListFilters
Post Detail:     PostDetail, PostMetaHeader, PostActions, CodeViewer,
                 InlineComment, CommentThread, CommentInput, PresenceIndicator
Editor:          PostEditor, CodeEditor (CodeMirror 6), EditorToolbar,
                 AiSuggestion, AiGeneratePanel, DraftStatus
History:         RevisionTimeline, RevisionDiffViewer, RestoreButton
Playground:      PromptPlayground, PromptVariableInput, PromptOutput
Search:          SearchResults, SearchResultItem
Auth:            LoginForm, RegisterForm
```

### Pinia Stores

`auth` (session, JWT), `posts` (CRUD, feed including personalized sort), `comments` (threaded comments), `search` (query, results), `tags` (available tags, subscriptions), `realtime` (WebSocket state, subscriptions, presence), `ui` (dark mode, sidebar, search modal).

**Personalized feed (`sort=personalized`):** Returns posts tagged with the user's subscribed tags, ranked by recency weighted by `vote_count`. Falls back to `trending` for users with no tag subscriptions.

### Composables

`useAuth` (auth state + guards), `useWebSocket` (connection, subscribe/unsubscribe, auto-reconnect with exponential backoff), `useSearch` (Cmd+K logic, debounce), `useAiComplete` (SSE stream handling), `usePresence` (viewers), `useKeyboard` (global shortcuts), `useDarkMode` (theme toggle with localStorage).

### Key Libraries

- **CodeMirror 6** — code editor (modular, Vue-friendly via `vue-codemirror`, supports AI ghost text extensions)
- **Shiki** — read-only syntax highlighting in detail view
- **PrimeVue** — UI primitives (buttons, dropdowns, dialogs, toasts)
- **VueUse** — utility composables (useLocalStorage, useDebounceFn, useEventListener)

## AI Integration

### LangChain.js Abstraction

Provider factory reads `LLM_PROVIDER` env var and returns the appropriate LangChain `BaseChatModel`:

- `ollama` → `ChatOllama` (default for local dev, gemma4 model)
- `openai` → `ChatOpenAI`
- `vertex` → `ChatVertexAI`

Three chains: `autocomplete` (code/markdown completion), `generate` (content from description), `search` (natural language → structured query).

### AI Features

- **Autocomplete:** Client sends content + cursor position + language. Server streams via SSE. Client renders as ghost text in CodeMirror. Debounced 300ms, cancellable on new keystroke.
- **Generate:** Client sends description + target type + language. Server streams via SSE. Progressive rendering in editor. User can stop mid-stream.
- **AI Search:** "Ask AI" toggle routes query through search chain first (NL → structured filters), then PostgreSQL. Falls back to plain search on failure.
- **Prompt Playground:** Variables filled in by user, assembled prompt passed directly to LLM. Streams via SSE.

### AI Rate Limiting

All AI endpoints enforce per-user concurrency limits:

- **1 in-flight AI request per user** — second request returns HTTP 429 with `Retry-After` header
- **Request timeout:** 60 seconds max streaming duration, then server closes the SSE connection
- **Token budget (production):** When using OpenAI/Vertex, a daily per-user token budget is enforced (configurable via env). Ollama has no budget limit since it's local.
- Rate limiting is implemented as a Fastify `onRequest` hook on all `/api/ai/*` and `/api/playground/*` routes.

## Search Architecture

### PostgreSQL Full-Text Search

- `pg_trgm` extension for fuzzy/typo-tolerant matching
- `unaccent` extension for accent-insensitive search
- Custom `forge_search` text search config
- Weighted `tsvector`: title (A) > content (B) > tags (C)
- Auto-populated via trigger on post insert/update
- GIN indexes on `search_vector` and `title` (trigram)

### Search Flow

- AI toggle OFF: direct PostgreSQL `tsvector` match + trigram fallback for typos
- AI toggle ON: LangChain interprets query → structured filters → same PostgreSQL query with better intent

### Regex Search

Regex search (mentioned in the brief) is deferred to a future enhancement. The MVP search covers full-text stemmed search + trigram fuzzy matching, which handles the vast majority of developer search needs. Regex support can be added later as a separate query path using PostgreSQL's `~` operator, activated when the search input is detected as a regex pattern (e.g., starts with `/` or contains regex metacharacters).

### Cmd+K Modal Response

Results grouped into: Snippets (matching posts), AI Actions (synthetic "Generate X" suggestions), People (author name match).

## Real-Time Architecture

### WebSocket Server

`@fastify/websocket` plugin. In-memory channel manager (no Redis — single server process). Connection handler validates JWT, registers in `ConnectionManager` (supports multiple tabs per user).

### Channel-Based Multiplexing

Client subscribes/unsubscribes to channels as they navigate. REST mutations broadcast to channel subscribers, excluding the sender (REST response already updated their UI).

### Presence

Heartbeat-based (client pings every 30s, server evicts after 60s silence). Displayed as avatar list on post detail view.

### Client Composable

Single shared WebSocket connection. `useWebSocket` composable provides: `subscribe(channel, handler)` returning cleanup function, auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s), automatic re-subscription on reconnect.

## Security

### Password Hashing

Local auth passwords MUST be hashed with **bcrypt (cost factor >= 12)** or **Argon2id**. Raw passwords are never stored or logged. The `password_hash` column is NULL for SSO-only users. Implementation should use the `bcrypt` npm package (or `argon2` package).

### Authentication Rate Limiting

Auth endpoints enforce per-IP rate limits to prevent credential stuffing:

- `POST /api/auth/login`: 5 attempts per minute per IP. After 10 consecutive failures on the same account, impose a 15-minute account lockout (responded as HTTP 429 with `Retry-After`).
- `POST /api/auth/register`: 3 registrations per hour per IP.
- `GET /api/auth/google/callback`: 10 per minute per IP.

Rate limiting is implemented as a Fastify `onRequest` hook using an in-memory rate limiter (`@fastify/rate-limit` or equivalent).

### Link Preview SSRF Protection

When `content_type='link'`, the server fetches Open Graph metadata from `link_url`. This fetch is an SSRF vector. Mitigations:

- **Scheme allowlist**: Only `https://` URLs are fetched. `http://`, `file://`, `ftp://`, and other schemes are rejected.
- **IP blocklist**: After DNS resolution, the resolved IP is checked against blocked ranges before the request is made: `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1/128`, `fc00::/7`. If the resolved IP falls in any blocked range, the fetch is aborted and `link_preview` is set to NULL.
- **Timeout & size cap**: Fetch timeout of 5 seconds, response body capped at 1 MB. Redirect limit of 3 hops, each hop re-checked against the IP blocklist.
- **Failure mode**: If the fetch fails or is blocked, the post is still created successfully — `link_preview` is simply NULL and the UI shows the raw URL without a preview card.

### Content Sanitization

- All markdown content rendered in the frontend is sanitized with **DOMPurify** before DOM injection.
- LLM output (autocomplete, generation, playground) is treated as untrusted user content and passes through the same sanitization pipeline.
- A `Content-Security-Policy` header blocking inline scripts is set on all client responses.

### JWT Storage

Access tokens are stored in memory (Pinia store) and sent via `Authorization: Bearer` header on REST requests. Refresh tokens are stored in `httpOnly`, `Secure`, `SameSite=Strict` cookies. This approach avoids XSS exposure of refresh tokens and eliminates CSRF risk via the `SameSite=Strict` attribute.

## Issue Decomposition

### Phase 1: MVP (Issues 1-7)

| #   | Issue                                | Depends On |
| --- | ------------------------------------ | ---------- |
| 1   | Project scaffolding & Docker Compose | —          |
| 2   | Database schema & migrations         | 1          |
| 3   | Authentication (Google SSO + local)  | 1, 2       |
| 4   | Core post CRUD & editor              | 2, 3       |
| 5   | App shell & feed UI                  | 3, 4       |
| 6   | Voting, bookmarks & tags             | 4, 5       |
| 7   | Comments & inline commenting         | 4, 5       |

### Phase 2: Real-Time & Search (Issues 8-9)

| #   | Issue                                       | Depends On |
| --- | ------------------------------------------- | ---------- |
| 8   | WebSocket infrastructure & real-time events | 5          |
| 9   | Search (PostgreSQL full-text + Cmd+K modal) | 4, 5       |

### Phase 3: AI Features (Issues 10-13)

| #   | Issue                                   | Depends On |
| --- | --------------------------------------- | ---------- |
| 10  | LangChain integration & AI autocomplete | 4          |
| 11  | AI content generation                   | 10         |
| 12  | AI-powered search                       | 9, 10      |
| 13  | Prompt playground                       | 10         |

### Phase 4: Collaboration & Polish (Issues 14-18)

| #   | Issue                           | Depends On |
| --- | ------------------------------- | ---------- |
| 14  | Revision history & visual diffs | 4          |
| 15  | Forking system                  | 4, 6       |
| 16  | Multi-file posts & file uploads | 4          |
| 17  | Link sharing & rich previews    | 4          |
| 18  | User profiles & gamification    | 6          |

### Future

| #   | Issue                  | Depends On |
| --- | ---------------------- | ---------- |
| 19  | Code execution sandbox | 13         |

**Decision: Code execution sandbox deferred.** The brief lists code execution as part of the Playground feature. This is intentionally deferred because: (1) secure sandboxed code execution requires significant infrastructure decisions (Firecracker microVMs, Docker-in-Docker, WASM runtimes) that are orthogonal to the rest of the platform, (2) the prompt playground delivers the higher-value part of the Playground feature first, and (3) the sandbox can be added as a self-contained feature without modifying existing code. Issue 19 should spec the sandbox runtime when it's picked up.

**MVP (issues 1-7) delivers:** Auth, full post CRUD with polished editor, feed/detail/sidebar UI, voting/bookmarks/tags, and threaded + inline comments. Users can sign in, create snippets, browse, vote, bookmark, comment inline, and filter by tags.
