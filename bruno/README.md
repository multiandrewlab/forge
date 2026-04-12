# Forge API — Bruno Collection

[Bruno](https://www.usebruno.com/) API client collection for local development and testing.

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

## Collection Variables

These variables are managed automatically by post-response scripts:

| Variable         | Set by                         | Used by                    |
| ---------------- | ------------------------------ | -------------------------- |
| `baseUrl`        | Environment (manual)           | All requests               |
| `accessToken`    | Register, Login, Refresh, Link | All authenticated requests |
| `postId`         | Create Post                    | Post and revision requests |
| `revisionNumber` | Create Revision                | Get Revision by Number     |

## Structure

```
bruno/
├── bruno.json              # Collection manifest
├── collection.bru          # Collection-level defaults
├── environments/
│   └── local.bru           # Local dev environment (localhost:3001)
├── auth/
│   ├── register.bru
│   ├── login.bru
│   ├── refresh.bru
│   ├── logout.bru
│   ├── get-me.bru
│   ├── update-me.bru
│   ├── google-callback.bru
│   └── link-google.bru
├── posts/
│   ├── create-post.bru
│   ├── get-feed.bru
│   ├── get-post.bru
│   ├── update-post.bru
│   ├── delete-post.bru
│   ├── publish-post.bru
│   └── revisions/
│       ├── create-revision.bru
│       ├── list-revisions.bru
│       └── get-revision.bru
└── health/
    └── health.bru
```

## Notes

- **Token auto-capture**: Register and Login responses automatically store `accessToken` in collection variables. All authenticated requests use `{{accessToken}}` in the Bearer header.
- **Cookies**: The `refresh_token` is set as an HTTP-only cookie by login/register. Bruno handles cookies automatically for same-domain requests, so the Refresh Token request works without manual setup.
- **Google OAuth**: The `google-callback` and `link-google` requests are included for completeness. The callback is not meant to be called directly — it's hit by Google's OAuth redirect.
