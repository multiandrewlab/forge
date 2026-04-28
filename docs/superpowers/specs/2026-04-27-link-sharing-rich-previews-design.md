# Link Sharing & Rich Previews — Design Spec

**Issue:** #6 — [17/19] Link sharing & rich previews
**Date:** 2026-04-27
**Status:** Approved

## Overview

When a user creates a post with `content_type='link'`, the server synchronously fetches Open Graph metadata from the target URL and stores it as JSONB in `link_preview`. The frontend renders a `LinkPreviewCard` component showing a thumbnail, title, description, and estimated reading time. SSRF protections prevent the server from fetching internal/private network resources.

## Design Decisions

| Decision          | Choice                                | Rationale                                                                            |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| Fetch timing      | Synchronous on create                 | Simplest for MVP; 5s worst-case only hits creator once                               |
| Manual refresh    | `POST /api/posts/:id/refresh-preview` | Clean dedicated endpoint, author-only                                                |
| HTML parsing      | `cheerio`                             | Industry standard, handles malformed HTML, focused API                               |
| SSRF approach     | DNS pre-check (no TOCTOU closure)     | Pragmatic for internal tool; TOCTOU gap is tiny and requires attacker-controlled DNS |
| Service structure | Single `link-preview.ts` file         | Linear pipeline; splitting adds indirection without benefit at this scale            |

## Section 1: Link Preview Service

**File:** `packages/server/src/services/link-preview.ts`

**Exported function:**

```typescript
fetchLinkPreview(url: string): Promise<LinkPreview | null>
```

**Internal pipeline:**

1. **`validateUrl(url)`** — rejects non-`https://` schemes. Returns parsed URL or throws.
2. **`resolveAndCheckIp(hostname)`** — calls `dns.resolve4()` / `dns.resolve6()`, checks every returned IP against the blocklist. Uses `ipaddr.js` for CIDR range matching. Rejects if any IP is blocked.
3. **`fetchWithSafety(url)`** — native `fetch()` with 5s timeout via `AbortSignal.timeout(5000)`, 1MB body cap (read stream and abort if exceeds), max 3 redirects. Each redirect hop re-resolves DNS and re-checks IP against the blocklist.
4. **`parseOpenGraph(html)`** — cheerio loads the HTML, extracts OG tags with fallbacks, estimates reading time.

### SSRF IP Blocklist

```
127.0.0.0/8       Loopback
10.0.0.0/8        RFC-1918
172.16.0.0/12     RFC-1918
192.168.0.0/16    RFC-1918
169.254.0.0/16    Link-local
0.0.0.0/8         Current network
::1/128           IPv6 loopback
fc00::/7          IPv6 ULA
fe80::/10         IPv6 link-local
100.64.0.0/10     Carrier-Grade NAT (RFC 6598)
192.0.0.0/24      IETF Protocol Assignments
```

### OG Tag Extraction

| OG Tag           | Fallback                   | Notes                                               |
| ---------------- | -------------------------- | --------------------------------------------------- |
| `og:title`       | `<title>` tag              | Required for non-null preview                       |
| `og:description` | `meta[name="description"]` | Optional                                            |
| `og:image`       | None                       | Must be `https://`; set to `null` if not            |
| Reading time     | Computed                   | Strip HTML → count words → `Math.ceil(words / 200)` |

### Fetch Constraints

- Timeout: 5000ms (`AbortSignal.timeout`)
- Response body cap: 1MB (abort stream if exceeded)
- Max redirects: 3 (each hop re-resolves DNS, re-checks IP)
- User-Agent: `ForgeBot/1.0 (+https://forge.internal)`

### Dependencies to Add

- `cheerio` — HTML parsing for OG tag extraction
- `ipaddr.js` — CIDR range matching for SSRF IP blocklist

### TOCTOU Note

DNS is resolved before `fetch()` connects. A DNS rebinding attack could theoretically resolve to a safe IP for our check, then a different (internal) IP for the actual connection. This gap is accepted for an internal tool. The code documents this limitation with a comment for future upgradeability.

## Section 2: Route Integration

### Modify `POST /api/posts`

When `contentType === 'link'`:

1. Require `linkUrl` in request body (Zod: `z.string().url()` conditional on content type)
2. Call `fetchLinkPreview(linkUrl)` before inserting
3. Insert post row with `link_preview` populated (single INSERT, not insert-then-update)
4. Return post with `linkPreview` populated (or `null` if fetch failed)

### New Endpoint: `POST /api/posts/:id/refresh-preview`

- **Auth:** Must be the post author (403 otherwise)
- **Validation:** Post must exist and have `contentType === 'link'` (400 otherwise)
- **Action:** Calls `fetchLinkPreview(post.linkUrl)`, updates `link_preview` column
- **Broadcast:** Emit `post:updated` event on feed channel (consistent with existing PATCH/publish patterns)
- **Response:** Updated post object

### Shared Validators Update

**File:** `packages/shared/src/validators/post.ts`

Add conditional validation: when `contentType === 'link'`, `linkUrl` is required and must be a valid URL string, and `content` becomes optional (link posts don't require body content — the link itself is the content). `linkUrl` remains optional/null for other content types.

## Section 3: Frontend Components

### LinkPreviewCard (`packages/client/src/components/post/LinkPreviewCard.vue`)

**With OG data — horizontal card layout:**

- Left: thumbnail image (120px wide, lazy-loaded, gradient placeholder on error)
- Right: title (single line, ellipsis), description (2-line clamp), reading time + domain
- Entire card clickable → opens `link_url` in new tab (`target="_blank" rel="noopener"`)
- Post author sees a refresh button that calls `POST /api/posts/:id/refresh-preview`

**Fallback (linkPreview is null):**

- Simple clickable URL text with external link icon
- Styled as a subtle bordered row

### PostListItem Modification (`packages/client/src/components/post/PostListItem.vue`)

- When `contentType === 'link'`, the content type badge includes a link/external-link icon alongside the text
- Other content types remain unchanged

### Styling

- Tailwind v4 with existing design tokens (no new config)
- Dark theme consistent with existing components (gray-700 borders, gray-100 text, primary accent)

## Section 4: Testing Strategy

### Server — link-preview.ts Unit Tests

- **URL validation:** rejects `http://`, `ftp://`, `file://`, empty strings; accepts valid `https://` URLs
- **SSRF IP blocking:** tests each blocked CIDR range; confirms allowed public IPs pass
- **Fetch behavior:** mock `fetch()` — test 5s timeout, 1MB body cap, redirect limit (3 hops), redirect IP re-checking
- **OG parsing:** test extraction of all OG tags with fallbacks; `og:image` rejects non-https; reading time calculation
- **End-to-end pipeline:** mock DNS + fetch → full `LinkPreview` returned; mock failure → `null` returned

### Server — Route Tests

- `POST /api/posts` with `contentType: 'link'` — confirm `fetchLinkPreview` called, result stored
- `POST /api/posts` with `contentType: 'link'` and missing `linkUrl` — 400 validation error
- `POST /api/posts/:id/refresh-preview` — author can refresh, non-author gets 403, non-link post gets 400
- Fetch failure → post created with `linkPreview: null`

### Client — LinkPreviewCard.vue Component Tests

- Renders title, description, image, reading time, domain when data present
- Renders fallback URL link when `linkPreview` is null
- Image error → shows placeholder
- Click opens URL in new tab
- Refresh button visible only for post author

### Client — PostListItem.vue

- Link icon renders for `contentType === 'link'`
- Other content types unaffected

### Coverage

All tests must achieve 100% coverage (lines, branches, functions, statements) per `.coverage-thresholds.json`.

### Bruno API Tests

New `.bru` files in `bruno/posts/`:

- Create link post (happy path) — assert 201
- Create link post missing `linkUrl` — assert 400
- Refresh link preview (author) — assert 200
- Refresh link preview (non-author) — assert 403

## Section 5: Error Handling & Edge Cases

**Principle:** The link preview is an enhancement, never a gate. Every failure results in the post being created with `linkPreview: null`.

| Scenario                     | Result                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------- |
| Non-https URL submitted      | Zod validation rejects at request level (400)                                     |
| DNS resolution fails         | `linkPreview = null`, post created                                                |
| IP resolves to blocked range | `linkPreview = null`, post created                                                |
| Fetch times out (>5s)        | `linkPreview = null`, post created                                                |
| Response body >1MB           | Abort read, `linkPreview = null`, post created                                    |
| >3 redirects                 | Abort, `linkPreview = null`, post created                                         |
| Redirect to blocked IP       | Abort, `linkPreview = null`, post created                                         |
| HTML has no OG tags          | Fallback to `<title>` / `meta[name="description"]`; if none, `linkPreview = null` |
| `og:image` is non-https      | `image = null`, rest of preview still populated                                   |
| Cheerio fails to parse       | `linkPreview = null`, post created                                                |

**Logging:** All failures logged server-side at `warn` level with URL and reason. No response bodies logged.

**No retry logic:** Author can use refresh button. No automatic retries.

## File Scope

| File                                                                    | Action                                                          |
| ----------------------------------------------------------------------- | --------------------------------------------------------------- |
| `packages/server/src/services/link-preview.ts`                          | New — OG fetch + SSRF protection                                |
| `packages/server/src/routes/posts.ts`                                   | Modify — integrate link preview on create, add refresh endpoint |
| `packages/client/src/components/post/LinkPreviewCard.vue`               | New — preview card component                                    |
| `packages/client/src/components/post/PostListItem.vue`                  | Modify — link icon for link posts                               |
| `packages/shared/src/validators/post.ts`                                | Modify — conditional `linkUrl` requirement                      |
| `packages/server/src/__tests__/services/link-preview.test.ts`           | New — service unit tests                                        |
| `packages/server/src/__tests__/routes/posts.test.ts`                    | Modify — add link post route tests                              |
| `packages/client/src/components/post/__tests__/LinkPreviewCard.test.ts` | New — component tests                                           |
| `packages/client/src/components/post/__tests__/PostListItem.test.ts`    | Modify — link icon test                                         |
| `bruno/posts/`                                                          | New — Bruno API tests for link endpoints                        |
