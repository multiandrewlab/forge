# Forge API — Bruno Collection

[Bruno](https://www.usebruno.com/) API client collection for local development and the BLOCKING pre-merge regression gate.

- **GitHub Actions workflow**: `.github/workflows/bruno-regression.yml`
- **Project-level gate contract**: see `CLAUDE.md` → "Bruno API Tests"
- **Origin**: the suite became enforceable in response to issue #28 — before that fix, Bruno CLI reported `✓ PASS` even when requests returned 5xx, because no `.bru` file asserted status codes.

## Desktop App

1. Install Bruno: `brew install bruno` or download from [usebruno.com](https://www.usebruno.com/downloads)
2. Open Bruno and click **Open Collection**
3. Select the `bruno/` directory in this repo
4. Select the **local** environment from the environment dropdown

## CLI Usage

Run requests from the terminal without the desktop app. All CLI commands must run from within the `bruno/` directory:

```bash
cd bruno

# Run a single request
npx @usebruno/cli run health/health.bru --env local

# Run all auth requests
npx @usebruno/cli run auth --env local

# Run the entire collection recursively
npx @usebruno/cli run -r --env local

# Run the E2E flow in order (login → CRUD → logout)
npx @usebruno/cli run \
  auth/login.bru \
  auth/get-me.bru \
  posts/create-post.bru \
  posts/publish-post.bru \
  posts/get-feed.bru \
  posts/get-post.bru \
  posts/revisions/create-revision.bru \
  posts/revisions/list-revisions.bru \
  posts/revisions/get-revision.bru \
  posts/delete-post.bru \
  auth/logout.bru \
  --env local

# Run with JSON output to a file
npx @usebruno/cli run -r --env local --output results.json
```

Or use the npm script from the project root:

```bash
npm run bruno
```

## End-to-End Flow

Run these requests in order to test the full API surface:

1. **Health Check** — `health/Health Check` — verify the server is running
2. **Register** — `auth/Register` — creates a user, auto-captures `accessToken`
3. **Login** — `auth/Login` — logs in, auto-captures `accessToken`
4. **Get Current User** — `auth/Get Current User` — verify auth works
5. **Create Post** — `posts/Create Post` — creates a draft, auto-captures `postId`
6. **Publish Post** — `posts/Publish Post` — publishes the draft
7. **Get Feed** — `posts/Get Feed` — verify the post appears in the feed
8. **Get Post by ID** — `posts/Get Post by ID` — fetch the post directly
9. **Create Revision** — `posts/revisions/Create Revision` — add a revision, auto-captures `revisionNumber`
10. **List Revisions** — `posts/revisions/List Revisions` — verify revision history
11. **Get Revision** — `posts/revisions/Get Revision by Number` — fetch a specific revision

## Conventions (ENFORCED)

### 1. Every `.bru` file MUST include an `assert {` block

The CI workflow lint-fails if any request `.bru` lacks an assertion block. Template:

```
assert {
  res.status: eq 200
}
```

Use `201` / `204` / documented error codes where relevant. See the Expected Status-Code Reference table below.

### 2. Auth is bootstrapped at the collection root

`bruno/collection.bru` contains a `script:pre-request` that logs in as the seeded `testuser` on the first request of any `bruno run -r` invocation and caches `{{accessToken}}` + `{{refreshToken}}`. New authenticated requests need only:

```
auth:bearer {
  token: {{accessToken}}
}
```

Do NOT add per-request logins.

### 3. Pin variables to seeded UUIDs, not ephemeral state

`bruno/environments/local.bru` pins `postId`, `commentId`, `revisionId`, `tagId` to deterministic seed rows. They stay stable throughout a `-r` run regardless of folder order. When a `.bru` creates a NEW resource that a later file needs, capture it into a `created*` variable (not the fixture variable):

```
script:post-response {
  if (res.body.post) {
    bru.setVar("createdPostId", res.body.post.id);
  }
}
```

Consumers use `{{createdPostId}}`. The fixture `{{postId}}` is never clobbered.

### 4. Error-path siblings

If an endpoint documents a non-2xx status (e.g. "returns 404 if no vote exists"), add a sibling `.bru` that exercises it. Example: `bruno/votes/remove-vote-no-existing.bru` runs after `remove-vote.bru` (seq 3) clears the vote and asserts 404.

## Collection Variables

Fixture variables are pinned in `environments/local.bru` (and `ci.bru`). `created*` variables are set by post-response scripts at runtime.

| Variable                    | Producer                                                                                   | Consumers                                                      |
| --------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `baseUrl`                   | env file                                                                                   | all requests                                                   |
| `testEmail`, `testPassword` | env file                                                                                   | collection pre-request login                                   |
| `accessToken`               | `collection.bru` pre-request (+ `auth/login.bru`, `auth/register.bru`, `auth/refresh.bru`) | all authenticated requests                                     |
| `refreshToken`              | `collection.bru` pre-request (+ `auth/login.bru`)                                          | `auth/refresh.bru`                                             |
| `postId` (pinned)           | env file = `c0000000-...-000000000099`                                                     | `get-post`, comments, votes, bookmarks, revisions (reads only) |
| `createdPostId`             | `posts/create-post.bru` post-response                                                      | `posts/update-post`, `posts/publish-post`, `posts/delete-post` |
| `revisionId` (pinned)       | env file = `d0000000-...-000000000099` — also re-set by `create-revision.bru`              | `list-comments-by-revision`, `create-inline-comment`           |
| `revisionNumber`            | env file = `1` — also re-set by `create-revision.bru`                                      | `get-revision`                                                 |
| `commentId` (pinned)        | env file = `e0000000-...-000000000099` — also re-set by `create-comment.bru`               | `edit-comment`, `delete-comment`, `create-reply`               |
| `tagId` (pinned)            | env file = `b0000000-...-000000000001`                                                     | `tags/subscribe`, `tags/unsubscribe`                           |

## Seeded Fixtures Reference

From `scripts/seed.sql`:

| Fixture          | UUID                                   | Owner                                                   |
| ---------------- | -------------------------------------- | ------------------------------------------------------- |
| testuser         | `a0000000-0000-0000-0000-000000000099` | `testuser@example.com` / `password123` (bcrypt cost-12) |
| Fixture post     | `c0000000-0000-0000-0000-000000000099` | testuser — public snippet, not draft                    |
| Fixture revision | `d0000000-0000-0000-0000-000000000099` | testuser — revision 1 of the fixture post               |
| Fixture comment  | `e0000000-0000-0000-0000-000000000099` | testuser — top-level on the fixture post                |
| `typescript` tag | `b0000000-0000-0000-0000-000000000001` | —                                                       |

To regenerate the testuser password hash (rarely needed):

```bash
cd packages/server
node -e 'import("bcryptjs").then(b => b.default.hash("password123", 12).then(h => console.log(h)))'
```

## Expected Status-Code Reference

| Endpoint                       | Method | Expected                            |
| ------------------------------ | ------ | ----------------------------------- |
| `/api/health`                  | GET    | 200                                 |
| `/api/auth/register`           | POST   | 200 (runtime email via pre-request) |
| `/api/auth/login`              | POST   | 200                                 |
| `/api/auth/logout`             | POST   | 204                                 |
| `/api/auth/refresh`            | POST   | 200                                 |
| `/api/auth/me`                 | GET    | 200                                 |
| `/api/auth/me`                 | PATCH  | 200                                 |
| `/api/auth/google/callback`    | GET    | 501 (stub — no OAuth configured)    |
| `/api/auth/link-google`        | POST   | 401 (stub)                          |
| `/api/posts`                   | POST   | 201                                 |
| `/api/posts/feed`              | GET    | 200                                 |
| `/api/posts/:id`               | GET    | 200                                 |
| `/api/posts/:id`               | PATCH  | 200                                 |
| `/api/posts/:id/publish`       | POST   | 200                                 |
| `/api/posts/:id`               | DELETE | 204                                 |
| `/api/posts/:id/revisions`     | POST   | 201                                 |
| `/api/posts/:id/revisions`     | GET    | 200                                 |
| `/api/posts/:id/revisions/:n`  | GET    | 200                                 |
| `/api/posts/:id/comments`      | GET    | 200                                 |
| `/api/posts/:id/comments`      | POST   | 201                                 |
| `/api/posts/:id/comments/:cid` | PATCH  | 200                                 |
| `/api/posts/:id/comments/:cid` | DELETE | 204                                 |
| `/api/posts/:id/bookmark`      | POST   | 200                                 |
| `/api/bookmarks`               | GET    | 200                                 |
| `/api/posts/:id/vote`          | POST   | 200                                 |
| `/api/posts/:id/vote`          | DELETE | 200 on success / 404 when no vote   |
| `/api/tags`                    | GET    | 200                                 |
| `/api/tags/popular`            | GET    | 200                                 |
| `/api/tags/:id/subscribe`      | POST   | 201                                 |
| `/api/tags/:id/subscribe`      | DELETE | 204                                 |
| `/api/tags/subscriptions`      | GET    | 200                                 |
| `/api/search`                  | GET    | 200                                 |

## Structure

```
bruno/
├── README.md                # this file
├── bruno.json               # collection manifest
├── collection.bru           # collection-root auth bootstrap (script:pre-request)
├── environments/
│   ├── local.bru            # localhost:3001 (pinned seed UUIDs + testuser creds)
│   └── ci.bru               # CI mirror — same baseUrl, same UUIDs
├── auth/                    # 8 requests
├── bookmarks/               # 2 requests
├── comments/                # 7 requests
├── health/                  # 1 request
├── posts/                   # 6 requests + revisions/ (3)
├── search/                  # 6 requests
├── tags/                    # 5 requests
└── votes/                   # 3 happy-path + 1 error-path (remove-vote-no-existing)
```

## Troubleshooting

**`auth/register` returns 429**: the register endpoint rate-limits at 3/hour per IP. On a fresh server this is never hit. During development, restart the server (`pkill -f "tsx src/server.ts"; cd packages/server && npx tsx src/server.ts &`) to clear in-memory rate-limit state.

**An endpoint returns 5xx unexpectedly**: re-run the seed (`psql "$DATABASE_URL" -f scripts/seed.sql`). Most failures are caused by a test mutating seeded state (e.g. `delete-comment` removes the fixture comment). The seed is idempotent — re-running it restores state.

**The suite passes locally but fails in CI**: confirm the migration + seed step ran before the server started. The CI job requires the DB to be fully populated before the server polls `/api/health`.

## Notes

- **Token auto-capture**: the collection-root pre-request plus `auth/login.bru` and `auth/register.bru` post-response scripts all maintain `{{accessToken}}`. Order-independent.
- **Cookies**: the `refresh_token` is set as an HTTP-only cookie by login/register. Bruno handles cookies automatically for same-domain requests, so `auth/refresh.bru` works without manual setup.
- **Google OAuth stubs**: `google-callback` and `link-google` assert their stub-mode statuses (501 and 401). When OAuth is actually wired up these assertions will change — update this README's table.
