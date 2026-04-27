# Link Sharing & Rich Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement link-type posts with automatic Open Graph metadata fetching, SSRF protection, and rich preview cards in the UI.

**Architecture:** Single `link-preview.ts` service handles URL validation, DNS-based SSRF checking, OG tag extraction via cheerio, and reading time estimation. The service is called synchronously during post creation. A dedicated refresh endpoint allows authors to re-fetch stale previews. The frontend renders a `LinkPreviewCard` component with graceful fallback when preview data is unavailable.

**Tech Stack:** Node.js native `fetch` + `dns.promises`, `cheerio` (HTML parsing), `ipaddr.js` (CIDR matching), Vue 3 + Tailwind v4, Vitest, Bruno

**Spec:** `docs/superpowers/specs/2026-04-27-link-sharing-rich-previews-design.md`

**Issue:** #6

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `packages/server/src/services/link-preview.ts` | Create | OG fetch pipeline: URL validation, SSRF IP check, fetch with safety limits, HTML parsing, reading time |
| `packages/server/src/__tests__/services/link-preview.test.ts` | Create | Unit tests for all link-preview service functions |
| `packages/shared/src/validators/post.ts` | Modify | Conditional `linkUrl` required + `content` optional when `contentType === 'link'` |
| `packages/server/src/db/queries/posts.ts` | Modify | Extend `CreatePostInput` and `createPost()` to accept `linkUrl` / `linkPreview`; add `updateLinkPreview()` |
| `packages/server/src/routes/posts.ts` | Modify | Call link-preview service on link post create; add `POST /:id/refresh-preview` endpoint |
| `packages/server/src/__tests__/routes/posts.test.ts` | Modify | Add tests for link post creation and refresh endpoint |
| `packages/client/src/components/post/LinkPreviewCard.vue` | Create | Preview card with OG data display + fallback |
| `packages/client/src/components/post/__tests__/LinkPreviewCard.test.ts` | Create | Component tests for both states + image error + author refresh |
| `packages/client/src/components/post/PostListItem.vue` | Modify | Link icon badge for link-type posts |
| `packages/client/src/components/post/__tests__/PostListItem.test.ts` | Modify | Test link icon renders for link content type |
| `bruno/posts/create-link-post.bru` | Create | Happy-path link post creation |
| `bruno/posts/create-link-post-missing-url.bru` | Create | Validation error: missing linkUrl |
| `bruno/posts/refresh-link-preview.bru` | Create | Author refreshes preview |
| `bruno/posts/refresh-link-preview-forbidden.bru` | Create | Non-author refresh → 403 |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `packages/server/package.json`

- [ ] **Step 1: Install cheerio and ipaddr.js**

```bash
cd packages/server && npm install cheerio ipaddr.js
```

- [ ] **Step 2: Verify install**

```bash
cd packages/server && node -e "require('cheerio'); require('ipaddr.js'); console.log('OK')"
```

Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json packages/server/package-lock.json
git commit -m "chore: add cheerio and ipaddr.js for link preview service"
```

---

### Task 2: Extend Shared Validators

**Files:**
- Modify: `packages/shared/src/validators/post.ts`
- Test: `packages/shared/src/__tests__/validators/post.test.ts` (create if needed)

- [ ] **Step 1: Write failing tests for conditional linkUrl validation**

Create or extend `packages/shared/src/__tests__/validators/post.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createPostSchema } from '../../validators/post.js';

describe('createPostSchema', () => {
  describe('link content type', () => {
    it('requires linkUrl when contentType is link', () => {
      const result = createPostSchema.safeParse({
        title: 'My Link',
        contentType: 'link',
        content: '',
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        const issues = result.error.issues.map((i) => i.message);
        expect(issues).toContain('linkUrl is required for link posts');
      }
    });

    it('accepts link post with linkUrl and no content', () => {
      const result = createPostSchema.safeParse({
        title: 'My Link',
        contentType: 'link',
        linkUrl: 'https://example.com/article',
      });
      expect(result.success).toBe(true);
    });

    it('accepts link post with linkUrl and optional content', () => {
      const result = createPostSchema.safeParse({
        title: 'My Link',
        contentType: 'link',
        linkUrl: 'https://example.com/article',
        content: 'Check this out',
      });
      expect(result.success).toBe(true);
    });

    it('rejects linkUrl that is not a valid URL', () => {
      const result = createPostSchema.safeParse({
        title: 'My Link',
        contentType: 'link',
        linkUrl: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('non-link content types', () => {
    it('still requires content for snippet posts', () => {
      const result = createPostSchema.safeParse({
        title: 'My Snippet',
        contentType: 'snippet',
        content: '',
      });
      expect(result.success).toBe(false);
    });

    it('ignores linkUrl for snippet posts', () => {
      const result = createPostSchema.safeParse({
        title: 'My Snippet',
        contentType: 'snippet',
        content: 'console.log("hi")',
        linkUrl: 'https://example.com',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.linkUrl).toBeUndefined();
      }
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/shared && npx vitest run src/__tests__/validators/post.test.ts
```

Expected: FAIL — `linkUrl` not recognized by schema, content still required for link type.

- [ ] **Step 3: Implement conditional validation**

Modify `packages/shared/src/validators/post.ts`:

```typescript
import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z
  .object({
    title: z.string().min(1).max(500),
    contentType: z.enum([
      ContentType.Snippet,
      ContentType.Prompt,
      ContentType.Document,
      ContentType.Link,
    ]),
    language: z.string().nullable().optional(),
    visibility: z
      .enum([Visibility.Public, Visibility.Private])
      .default(Visibility.Public),
    isDraft: z.boolean().default(true),
    content: z.string().min(1).optional(),
    linkUrl: z.string().url().optional(),
    tags: z.array(z.string()).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.contentType === ContentType.Link) {
      if (!data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'linkUrl is required for link posts',
          path: ['linkUrl'],
        });
      }
    } else {
      if (!data.content || data.content.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'content is required for non-link posts',
          path: ['content'],
        });
      }
      // Strip linkUrl for non-link types
      data.linkUrl = undefined;
    }
  });

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  contentType: z
    .enum([
      ContentType.Snippet,
      ContentType.Prompt,
      ContentType.Document,
      ContentType.Link,
    ])
    .optional(),
  language: z.string().nullable().optional(),
  visibility: z
    .enum([Visibility.Public, Visibility.Private])
    .optional(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const createRevisionSchema = z.object({
  content: z.string().min(1),
  message: z.string().max(500).optional(),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/shared && npx vitest run src/__tests__/validators/post.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Run full shared package tests to check for regressions**

```bash
cd packages/shared && npx vitest run
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/validators/post.ts packages/shared/src/__tests__/validators/post.test.ts
git commit -m "feat: add conditional linkUrl validation for link posts"
```

---

### Task 3: Extend DB Queries

**Files:**
- Modify: `packages/server/src/db/queries/posts.ts`
- Test: `packages/server/src/__tests__/db/queries/posts.test.ts` (create if needed)

- [ ] **Step 1: Write failing test for createPost with link fields**

Create or extend `packages/server/src/__tests__/db/queries/posts.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQuery = vi.fn();
vi.mock('../../connection.js', () => ({
  getPool: () => ({ query: mockQuery }),
}));

import { createPost, updateLinkPreview } from '../../db/queries/posts.js';
import type { CreatePostInput } from '../../db/queries/posts.js';

describe('posts queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('createPost', () => {
    it('includes link_url and link_preview in INSERT when provided', async () => {
      const sampleRow = {
        id: 'post-1',
        author_id: 'user-1',
        title: 'My Link',
        content_type: 'link',
        language: null,
        visibility: 'public',
        is_draft: false,
        forked_from_id: null,
        link_url: 'https://example.com',
        link_preview: { title: 'Example', description: 'Desc', image: null, readingTime: 3 },
        vote_count: 0,
        view_count: 0,
        search_vector: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const input: CreatePostInput = {
        authorId: 'user-1',
        title: 'My Link',
        contentType: 'link',
        language: null,
        visibility: 'public',
        isDraft: false,
        linkUrl: 'https://example.com',
        linkPreview: { title: 'Example', description: 'Desc', image: null, readingTime: 3 },
      };

      const result = await createPost(input);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('link_url');
      expect(sql).toContain('link_preview');
      expect(params).toContain('https://example.com');
      expect(result).toEqual(sampleRow);
    });

    it('sets link_url and link_preview to null when not provided', async () => {
      const sampleRow = {
        id: 'post-2',
        author_id: 'user-1',
        title: 'My Snippet',
        content_type: 'snippet',
        language: 'javascript',
        visibility: 'public',
        is_draft: true,
        forked_from_id: null,
        link_url: null,
        link_preview: null,
        vote_count: 0,
        view_count: 0,
        search_vector: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [sampleRow] });

      const input: CreatePostInput = {
        authorId: 'user-1',
        title: 'My Snippet',
        contentType: 'snippet',
        language: 'javascript',
        visibility: 'public',
        isDraft: true,
      };

      await createPost(input);

      const [, params] = mockQuery.mock.calls[0];
      // link_url and link_preview should be null
      expect(params).toContain(null);
    });
  });

  describe('updateLinkPreview', () => {
    it('updates link_preview column for the given post', async () => {
      const updatedRow = {
        id: 'post-1',
        author_id: 'user-1',
        title: 'My Link',
        content_type: 'link',
        language: null,
        visibility: 'public',
        is_draft: false,
        forked_from_id: null,
        link_url: 'https://example.com',
        link_preview: { title: 'Fresh Title', description: 'Fresh', image: null, readingTime: 2 },
        vote_count: 0,
        view_count: 0,
        search_vector: null,
        deleted_at: null,
        created_at: new Date(),
        updated_at: new Date(),
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow] });

      const preview = { title: 'Fresh Title', description: 'Fresh', image: null, readingTime: 2 };
      const result = await updateLinkPreview('post-1', preview);

      expect(mockQuery).toHaveBeenCalledOnce();
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toContain('link_preview');
      expect(sql).toContain('updated_at');
      expect(params[0]).toEqual(JSON.stringify(preview));
      expect(params[1]).toBe('post-1');
      expect(result).toEqual(updatedRow);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && npx vitest run src/__tests__/db/queries/posts.test.ts
```

Expected: FAIL — `linkUrl`/`linkPreview` not in `CreatePostInput`, `updateLinkPreview` not exported.

- [ ] **Step 3: Extend CreatePostInput and createPost**

Modify `packages/server/src/db/queries/posts.ts`:

Add `linkUrl` and `linkPreview` to `CreatePostInput`:

```typescript
export interface CreatePostInput {
  authorId: string;
  title: string;
  contentType: string;
  language: string | null;
  visibility: string;
  isDraft: boolean;
  linkUrl?: string;
  linkPreview?: { title: string; description: string; image: string | null; readingTime: number | null };
}
```

Update `createPost()` to include link fields:

```typescript
export async function createPost(input: CreatePostInput): Promise<PostRow> {
  const pool = getPool();
  const result = await pool.query(
    `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft, link_url, link_preview)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.authorId,
      input.title,
      input.contentType,
      input.language,
      input.visibility,
      input.isDraft,
      input.linkUrl ?? null,
      input.linkPreview ? JSON.stringify(input.linkPreview) : null,
    ],
  );
  return result.rows[0] as PostRow;
}
```

Add `updateLinkPreview()`:

```typescript
export async function updateLinkPreview(
  postId: string,
  preview: { title: string; description: string; image: string | null; readingTime: number | null } | null,
): Promise<PostRow> {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE posts SET link_preview = $1, updated_at = NOW()
     WHERE id = $2 AND deleted_at IS NULL
     RETURNING *`,
    [preview ? JSON.stringify(preview) : null, postId],
  );
  return result.rows[0] as PostRow;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run src/__tests__/db/queries/posts.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/queries/posts.ts packages/server/src/__tests__/db/queries/posts.test.ts
git commit -m "feat: extend createPost query with linkUrl/linkPreview, add updateLinkPreview"
```

---

### Task 4: Link Preview Service

**Files:**
- Create: `packages/server/src/services/link-preview.ts`
- Create: `packages/server/src/__tests__/services/link-preview.test.ts`

This is the largest task. The service has four internal functions and one exported function.

- [ ] **Step 1: Write tests for URL validation**

Create `packages/server/src/__tests__/services/link-preview.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dns from 'node:dns/promises';

// Mock dns.resolve4 and dns.resolve6
vi.mock('node:dns/promises', () => ({
  default: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  fetchLinkPreview,
  validateUrl,
  isIpBlocked,
  parseOpenGraph,
} from '../../services/link-preview.js';

describe('link-preview service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('validateUrl', () => {
    it('accepts valid https URLs', () => {
      expect(() => validateUrl('https://example.com/article')).not.toThrow();
    });

    it('rejects http URLs', () => {
      expect(() => validateUrl('http://example.com')).toThrow('Only https:// URLs are allowed');
    });

    it('rejects ftp URLs', () => {
      expect(() => validateUrl('ftp://example.com')).toThrow('Only https:// URLs are allowed');
    });

    it('rejects file URLs', () => {
      expect(() => validateUrl('file:///etc/passwd')).toThrow('Only https:// URLs are allowed');
    });

    it('rejects empty strings', () => {
      expect(() => validateUrl('')).toThrow();
    });

    it('rejects invalid URLs', () => {
      expect(() => validateUrl('not-a-url')).toThrow();
    });

    it('returns parsed URL for valid https', () => {
      const url = validateUrl('https://example.com/path?q=1');
      expect(url.hostname).toBe('example.com');
      expect(url.pathname).toBe('/path');
    });
  });

  describe('isIpBlocked', () => {
    it('blocks 127.0.0.1 (loopback)', () => {
      expect(isIpBlocked('127.0.0.1')).toBe(true);
    });

    it('blocks 127.0.0.99 (loopback range)', () => {
      expect(isIpBlocked('127.0.0.99')).toBe(true);
    });

    it('blocks 10.0.0.1 (RFC-1918)', () => {
      expect(isIpBlocked('10.0.0.1')).toBe(true);
    });

    it('blocks 172.16.0.1 (RFC-1918)', () => {
      expect(isIpBlocked('172.16.0.1')).toBe(true);
    });

    it('blocks 172.31.255.255 (RFC-1918 upper bound)', () => {
      expect(isIpBlocked('172.31.255.255')).toBe(true);
    });

    it('blocks 192.168.1.1 (RFC-1918)', () => {
      expect(isIpBlocked('192.168.1.1')).toBe(true);
    });

    it('blocks 169.254.1.1 (link-local)', () => {
      expect(isIpBlocked('169.254.1.1')).toBe(true);
    });

    it('blocks 0.0.0.0 (current network)', () => {
      expect(isIpBlocked('0.0.0.0')).toBe(true);
    });

    it('blocks 100.64.0.1 (carrier-grade NAT)', () => {
      expect(isIpBlocked('100.64.0.1')).toBe(true);
    });

    it('blocks 192.0.0.1 (IETF protocol assignments)', () => {
      expect(isIpBlocked('192.0.0.1')).toBe(true);
    });

    it('blocks ::1 (IPv6 loopback)', () => {
      expect(isIpBlocked('::1')).toBe(true);
    });

    it('blocks fc00::1 (IPv6 ULA)', () => {
      expect(isIpBlocked('fc00::1')).toBe(true);
    });

    it('blocks fe80::1 (IPv6 link-local)', () => {
      expect(isIpBlocked('fe80::1')).toBe(true);
    });

    it('allows 8.8.8.8 (public IP)', () => {
      expect(isIpBlocked('8.8.8.8')).toBe(false);
    });

    it('allows 93.184.216.34 (public IP)', () => {
      expect(isIpBlocked('93.184.216.34')).toBe(false);
    });

    it('allows 172.32.0.1 (outside RFC-1918 range)', () => {
      expect(isIpBlocked('172.32.0.1')).toBe(false);
    });

    it('allows 2606:4700::1 (public IPv6)', () => {
      expect(isIpBlocked('2606:4700::1')).toBe(false);
    });
  });

  describe('parseOpenGraph', () => {
    it('extracts og:title, og:description, og:image', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="My Article">
          <meta property="og:description" content="A great article">
          <meta property="og:image" content="https://example.com/img.jpg">
        </head><body><p>word </p></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result).toEqual({
        title: 'My Article',
        description: 'A great article',
        image: 'https://example.com/img.jpg',
        readingTime: 1,
      });
    });

    it('falls back to <title> when og:title missing', () => {
      const html = `
        <html><head><title>Fallback Title</title>
          <meta name="description" content="Fallback desc">
        </head><body></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result?.title).toBe('Fallback Title');
      expect(result?.description).toBe('Fallback desc');
    });

    it('falls back to meta[name="description"] when og:description missing', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Title">
          <meta name="description" content="Meta desc">
        </head><body></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result?.description).toBe('Meta desc');
    });

    it('returns null when no title found at all', () => {
      const html = '<html><head></head><body></body></html>';
      const result = parseOpenGraph(html);
      expect(result).toBeNull();
    });

    it('rejects non-https og:image', () => {
      const html = `
        <html><head>
          <meta property="og:title" content="Title">
          <meta property="og:image" content="http://example.com/img.jpg">
        </head><body></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result?.image).toBeNull();
    });

    it('calculates reading time from body text', () => {
      const words = Array(600).fill('word').join(' ');
      const html = `
        <html><head><meta property="og:title" content="Title"></head>
        <body><p>${words}</p></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result?.readingTime).toBe(3); // 600 / 200 = 3
    });

    it('returns readingTime of 1 for very short content', () => {
      const html = `
        <html><head><meta property="og:title" content="Title"></head>
        <body><p>Short</p></body></html>
      `;
      const result = parseOpenGraph(html);
      expect(result?.readingTime).toBe(1); // Math.ceil(1/200) = 1
    });
  });

  describe('fetchLinkPreview', () => {
    it('returns LinkPreview for a valid URL with OG tags', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('no AAAA'));

      const html = `
        <html><head>
          <meta property="og:title" content="Example">
          <meta property="og:description" content="Example Domain">
          <meta property="og:image" content="https://example.com/img.png">
        </head><body>${Array(400).fill('word').join(' ')}</body></html>
      `;

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: {
          getReader: () => {
            let done = false;
            return {
              read: () => {
                if (done) return Promise.resolve({ done: true, value: undefined });
                done = true;
                return Promise.resolve({ done: false, value: new TextEncoder().encode(html) });
              },
              cancel: vi.fn(),
            };
          },
        },
      });

      const result = await fetchLinkPreview('https://example.com');
      expect(result).toEqual({
        title: 'Example',
        description: 'Example Domain',
        image: 'https://example.com/img.png',
        readingTime: 2,
      });
    });

    it('returns null when DNS resolves to blocked IP', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['127.0.0.1']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('no AAAA'));

      const result = await fetchLinkPreview('https://evil.com');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('returns null when DNS resolves to private IPv6', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('no A'));
      vi.mocked(dns.resolve6).mockResolvedValue(['fc00::1']);

      const result = await fetchLinkPreview('https://evil.com');
      expect(result).toBeNull();
    });

    it('returns null when fetch times out', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('no AAAA'));

      mockFetch.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      const result = await fetchLinkPreview('https://slow.com');
      expect(result).toBeNull();
    });

    it('returns null when URL is not https', async () => {
      const result = await fetchLinkPreview('http://example.com');
      expect(result).toBeNull();
      expect(dns.resolve4).not.toHaveBeenCalled();
    });

    it('returns null when DNS resolution fails', async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error('ENOTFOUND'));
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('ENOTFOUND'));

      const result = await fetchLinkPreview('https://nonexistent.invalid');
      expect(result).toBeNull();
    });

    it('returns null when response body exceeds 1MB', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('no AAAA'));

      const bigChunk = new Uint8Array(1024 * 1024 + 1); // >1MB

      mockFetch.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'text/html' }),
        body: {
          getReader: () => {
            let done = false;
            return {
              read: () => {
                if (done) return Promise.resolve({ done: true, value: undefined });
                done = true;
                return Promise.resolve({ done: false, value: bigChunk });
              },
              cancel: vi.fn(),
            };
          },
        },
      });

      const result = await fetchLinkPreview('https://huge.com');
      expect(result).toBeNull();
    });

    it('returns null when fetch returns non-ok status', async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(['93.184.216.34']);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error('no AAAA'));

      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Headers(),
      });

      const result = await fetchLinkPreview('https://example.com/404');
      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && npx vitest run src/__tests__/services/link-preview.test.ts
```

Expected: FAIL — module `../../services/link-preview.js` does not exist.

- [ ] **Step 3: Implement the link preview service**

Create `packages/server/src/services/link-preview.ts`:

```typescript
import dns from 'node:dns/promises';
import * as cheerio from 'cheerio';
import ipaddr from 'ipaddr.js';
import type { LinkPreview } from '@forge/shared';

const MAX_BODY_BYTES = 1024 * 1024; // 1 MB
const FETCH_TIMEOUT_MS = 5000;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'ForgeBot/1.0 (+https://forge.internal)';

// SSRF IP blocklist — see design spec for rationale
const BLOCKED_RANGES: [ipaddr.IPv4 | ipaddr.IPv6, number][] = [
  ...parseCidrs([
    '127.0.0.0/8',     // Loopback
    '10.0.0.0/8',      // RFC-1918
    '172.16.0.0/12',   // RFC-1918
    '192.168.0.0/16',  // RFC-1918
    '169.254.0.0/16',  // Link-local
    '0.0.0.0/8',       // Current network
    '100.64.0.0/10',   // Carrier-Grade NAT (RFC 6598)
    '192.0.0.0/24',    // IETF Protocol Assignments
  ]),
  ...parseCidrs([
    '::1/128',         // IPv6 loopback
    'fc00::/7',        // IPv6 ULA
    'fe80::/10',       // IPv6 link-local
  ]),
];

function parseCidrs(cidrs: string[]): [ipaddr.IPv4 | ipaddr.IPv6, number][] {
  return cidrs.map((cidr) => {
    const [addr, bits] = ipaddr.parseCIDR(cidr);
    return [addr, bits];
  });
}

export function validateUrl(urlString: string): URL {
  const url = new URL(urlString); // throws on invalid
  if (url.protocol !== 'https:') {
    throw new Error('Only https:// URLs are allowed');
  }
  return url;
}

export function isIpBlocked(ip: string): boolean {
  try {
    const addr = ipaddr.parse(ip);
    for (const [network, bits] of BLOCKED_RANGES) {
      if (addr.kind() === network.kind() && addr.match([network, bits])) {
        return true;
      }
    }
    return false;
  } catch {
    return true; // if we can't parse the IP, block it
  }
}

async function resolveAndCheckIp(hostname: string): Promise<boolean> {
  const ips: string[] = [];

  try {
    const ipv4 = await dns.resolve4(hostname);
    ips.push(...ipv4);
  } catch {
    // No A records — not an error, try AAAA
  }

  try {
    const ipv6 = await dns.resolve6(hostname);
    ips.push(...ipv6);
  } catch {
    // No AAAA records
  }

  if (ips.length === 0) {
    return false; // No DNS records at all
  }

  return ips.every((ip) => !isIpBlocked(ip));
}

async function fetchWithSafety(url: string): Promise<string | null> {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const parsed = new URL(currentUrl);

    // Check IP for each hop (SSRF redirect protection)
    // Note: TOCTOU gap accepted for internal tool — see design spec
    if (redirectCount > 0) {
      const allowed = await resolveAndCheckIp(parsed.hostname);
      if (!allowed) return null;
    }

    const response = await fetch(currentUrl, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'manual',
    });

    // Handle redirects manually so we can check each hop
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) return null;

      try {
        const redirectUrl = new URL(location, currentUrl);
        if (redirectUrl.protocol !== 'https:') return null;
        currentUrl = redirectUrl.href;
        redirectCount++;
        continue;
      } catch {
        return null;
      }
    }

    if (!response.ok) return null;

    // Read body with size cap
    const reader = response.body?.getReader();
    if (!reader) return null;

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }

    const decoder = new TextDecoder();
    return chunks.map((c) => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  }

  return null; // too many redirects
}

export function parseOpenGraph(html: string): LinkPreview | null {
  const $ = cheerio.load(html);

  const ogTitle = $('meta[property="og:title"]').attr('content');
  const titleTag = $('title').text();
  const title = ogTitle || titleTag || null;

  if (!title) return null; // No title = no useful preview

  const ogDesc = $('meta[property="og:description"]').attr('content');
  const metaDesc = $('meta[name="description"]').attr('content');
  const description = ogDesc || metaDesc || '';

  const ogImage = $('meta[property="og:image"]').attr('content') ?? null;
  let image: string | null = null;
  if (ogImage) {
    try {
      const imgUrl = new URL(ogImage);
      image = imgUrl.protocol === 'https:' ? ogImage : null;
    } catch {
      image = null;
    }
  }

  // Reading time: strip HTML, count words, 200 wpm
  const bodyText = $('body').text().trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / 200));

  return { title, description, image, readingTime };
}

export async function fetchLinkPreview(urlString: string): Promise<LinkPreview | null> {
  try {
    const url = validateUrl(urlString);

    const allowed = await resolveAndCheckIp(url.hostname);
    if (!allowed) {
      console.warn(`[link-preview] Blocked: ${urlString} — resolved to private/reserved IP`);
      return null;
    }

    const html = await fetchWithSafety(urlString);
    if (!html) {
      console.warn(`[link-preview] Fetch failed: ${urlString}`);
      return null;
    }

    return parseOpenGraph(html);
  } catch (err) {
    console.warn(`[link-preview] Error fetching ${urlString}:`, (err as Error).message);
    return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run src/__tests__/services/link-preview.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/link-preview.ts packages/server/src/__tests__/services/link-preview.test.ts
git commit -m "feat: add link-preview service with SSRF protection and OG parsing"
```

---

### Task 5: Route Integration — Link Post Creation & Refresh Endpoint

**Files:**
- Modify: `packages/server/src/routes/posts.ts`
- Modify: `packages/server/src/__tests__/routes/posts.test.ts`

- [ ] **Step 1: Write failing tests for link post creation**

Add to `packages/server/src/__tests__/routes/posts.test.ts`:

```typescript
// At the top, add mock for link-preview service
vi.mock('../../services/link-preview.js', () => ({
  fetchLinkPreview: vi.fn(),
}));

import { fetchLinkPreview } from '../../services/link-preview.js';
```

Add these test cases inside the existing describe block:

```typescript
describe('POST /api/posts (link type)', () => {
  it('creates a link post and calls fetchLinkPreview', async () => {
    const linkPreview = {
      title: 'Example',
      description: 'Example Domain',
      image: 'https://example.com/img.png',
      readingTime: 3,
    };
    vi.mocked(fetchLinkPreview).mockResolvedValue(linkPreview);

    const postRow = {
      ...samplePostRow,
      content_type: 'link',
      link_url: 'https://example.com',
      link_preview: linkPreview,
    };

    // createPost returns the post row
    mockQuery.mockResolvedValueOnce({ rows: [postRow] });
    // createRevision returns revision row
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow] });
    // findFeedPostById for broadcast
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleFeedRow, content_type: 'link', link_url: 'https://example.com', link_preview: linkPreview }] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Cool Article',
        contentType: 'link',
        linkUrl: 'https://example.com',
        content: '',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(vi.mocked(fetchLinkPreview)).toHaveBeenCalledWith('https://example.com');
    const body = response.json();
    expect(body.post.linkUrl).toBe('https://example.com');
  });

  it('creates link post with null preview when fetch fails', async () => {
    vi.mocked(fetchLinkPreview).mockResolvedValue(null);

    const postRow = {
      ...samplePostRow,
      content_type: 'link',
      link_url: 'https://example.com',
      link_preview: null,
    };

    mockQuery.mockResolvedValueOnce({ rows: [postRow] });
    mockQuery.mockResolvedValueOnce({ rows: [sampleRevisionRow] });
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleFeedRow, content_type: 'link', link_url: 'https://example.com', link_preview: null }] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Cool Article',
        contentType: 'link',
        linkUrl: 'https://example.com',
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().post.linkPreview).toBeNull();
  });

  it('returns 400 when link post missing linkUrl', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/posts',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        title: 'Missing URL',
        contentType: 'link',
      },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/posts/:id/refresh-preview', () => {
  it('refreshes preview for author', async () => {
    const existingPost = {
      ...samplePostRow,
      content_type: 'link',
      link_url: 'https://example.com',
      link_preview: null,
    };

    const newPreview = {
      title: 'Fresh Title',
      description: 'Fresh',
      image: null,
      readingTime: 2,
    };

    vi.mocked(fetchLinkPreview).mockResolvedValue(newPreview);

    // findPostById
    mockQuery.mockResolvedValueOnce({ rows: [existingPost] });
    // updateLinkPreview
    mockQuery.mockResolvedValueOnce({ rows: [{ ...existingPost, link_preview: newPreview }] });
    // findFeedPostById for broadcast
    mockQuery.mockResolvedValueOnce({ rows: [{ ...sampleFeedRow, content_type: 'link', link_url: 'https://example.com', link_preview: newPreview }] });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/refresh-preview`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(vi.mocked(fetchLinkPreview)).toHaveBeenCalledWith('https://example.com');
  });

  it('returns 403 for non-author', async () => {
    const existingPost = {
      ...samplePostRow,
      author_id: otherUserId,
      content_type: 'link',
      link_url: 'https://example.com',
    };

    mockQuery.mockResolvedValueOnce({ rows: [existingPost] });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/refresh-preview`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
  });

  it('returns 400 for non-link post', async () => {
    const snippetPost = { ...samplePostRow, content_type: 'snippet' };

    mockQuery.mockResolvedValueOnce({ rows: [snippetPost] });

    const response = await app.inject({
      method: 'POST',
      url: `/api/posts/${samplePostRow.id}/refresh-preview`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 for nonexistent post', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const response = await app.inject({
      method: 'POST',
      url: '/api/posts/nonexistent-id/refresh-preview',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts
```

Expected: FAIL — link-preview mock not imported, refresh-preview route doesn't exist.

- [ ] **Step 3: Modify the POST /api/posts route handler**

In `packages/server/src/routes/posts.ts`, add the import at the top:

```typescript
import { fetchLinkPreview } from '../services/link-preview.js';
import { updateLinkPreview } from '../db/queries/posts.js';
```

Modify the `POST /` handler. After Zod validation and before `createPost()`, add the link preview fetch. Also change the `createRevision` call to use `content` instead of `validated.content`:

```typescript
// After: const validated = createPostSchema.parse(request.body);
// Before: const postRow = await createPost({...});

let linkPreview = null;
if (validated.contentType === ContentType.Link && validated.linkUrl) {
  linkPreview = await fetchLinkPreview(validated.linkUrl);
}

// For link posts, content is optional — default to linkUrl for the revision
const content = validated.content || validated.linkUrl || '';

const postRow = await createPost({
  authorId: request.user.id,
  title: validated.title,
  contentType: validated.contentType,
  language: validated.language ?? null,
  visibility: validated.visibility,
  isDraft: validated.isDraft,
  linkUrl: validated.linkUrl,
  linkPreview: linkPreview ?? undefined,
});
```

- [ ] **Step 4: Add the refresh-preview endpoint**

Add before the closing of the `postRoutes` function in `packages/server/src/routes/posts.ts`:

```typescript
// Refresh link preview — author only
app.post('/:id/refresh-preview', { preHandler: [app.authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };

  const existing = await findPostById(id);
  if (!existing) {
    return reply.status(404).send({ error: 'Post not found' });
  }

  if (existing.author_id !== request.user.id) {
    return reply.status(403).send({ error: 'Only the author can refresh the link preview' });
  }

  if (existing.content_type !== ContentType.Link) {
    return reply.status(400).send({ error: 'Only link posts can have their preview refreshed' });
  }

  const preview = await fetchLinkPreview(existing.link_url!);
  const updatedRow = await updateLinkPreview(id, preview);

  // Broadcast update
  const feedPost = await findFeedPostById(id);
  if (feedPost) {
    app.websocket.channels.broadcast('feed', 'post:updated', toPostWithAuthor(feedPost));
  }

  return reply.send({ post: toPost(updatedRow) });
});
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd packages/server && npx vitest run src/__tests__/routes/posts.test.ts
```

Expected: ALL PASS

- [ ] **Step 6: Run full server test suite**

```bash
cd packages/server && npx vitest run
```

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/routes/posts.ts packages/server/src/__tests__/routes/posts.test.ts
git commit -m "feat: integrate link preview into post creation, add refresh-preview endpoint"
```

---

### Task 6: LinkPreviewCard Component

**Files:**
- Create: `packages/client/src/components/post/LinkPreviewCard.vue`
- Create: `packages/client/src/components/post/__tests__/LinkPreviewCard.test.ts`

- [ ] **Step 1: Write failing component tests**

Create `packages/client/src/components/post/__tests__/LinkPreviewCard.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import LinkPreviewCard from '../LinkPreviewCard.vue';

const fullPreview = {
  linkUrl: 'https://blog.example.com/typescript-generics',
  linkPreview: {
    title: 'Understanding TypeScript Generics',
    description: 'A comprehensive guide to TypeScript generics.',
    image: 'https://blog.example.com/og-image.jpg',
    readingTime: 5,
  },
  isAuthor: false,
};

describe('LinkPreviewCard', () => {
  describe('with preview data', () => {
    it('renders the title', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      expect(wrapper.text()).toContain('Understanding TypeScript Generics');
    });

    it('renders the description', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      expect(wrapper.text()).toContain('A comprehensive guide to TypeScript generics.');
    });

    it('renders the image with lazy loading', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      const img = wrapper.find('img');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe('https://blog.example.com/og-image.jpg');
      expect(img.attributes('loading')).toBe('lazy');
    });

    it('renders reading time', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      expect(wrapper.text()).toContain('5 min read');
    });

    it('renders the domain', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      expect(wrapper.text()).toContain('blog.example.com');
    });

    it('links to the URL with target="_blank" and rel="noopener"', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      const link = wrapper.find('a');
      expect(link.attributes('href')).toBe('https://blog.example.com/typescript-generics');
      expect(link.attributes('target')).toBe('_blank');
      expect(link.attributes('rel')).toContain('noopener');
    });

    it('does not show refresh button for non-author', () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      expect(wrapper.find('[data-testid="refresh-preview"]').exists()).toBe(false);
    });

    it('shows refresh button for author', () => {
      const wrapper = mount(LinkPreviewCard, { props: { ...fullPreview, isAuthor: true } });
      expect(wrapper.find('[data-testid="refresh-preview"]').exists()).toBe(true);
    });
  });

  describe('without preview data (fallback)', () => {
    it('renders the URL as a clickable link', () => {
      const wrapper = mount(LinkPreviewCard, {
        props: {
          linkUrl: 'https://example.com/article',
          linkPreview: null,
          isAuthor: false,
        },
      });
      const link = wrapper.find('a');
      expect(link.exists()).toBe(true);
      expect(link.attributes('href')).toBe('https://example.com/article');
      expect(link.text()).toContain('https://example.com/article');
    });
  });

  describe('image error handling', () => {
    it('hides image on error and shows placeholder', async () => {
      const wrapper = mount(LinkPreviewCard, { props: fullPreview });
      const img = wrapper.find('img');
      await img.trigger('error');
      expect(wrapper.find('[data-testid="image-placeholder"]').exists()).toBe(true);
    });
  });

  describe('without image', () => {
    it('shows placeholder when image is null', () => {
      const wrapper = mount(LinkPreviewCard, {
        props: {
          ...fullPreview,
          linkPreview: { ...fullPreview.linkPreview, image: null },
        },
      });
      expect(wrapper.find('img').exists()).toBe(false);
      expect(wrapper.find('[data-testid="image-placeholder"]').exists()).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/client && npx vitest run src/components/post/__tests__/LinkPreviewCard.test.ts
```

Expected: FAIL — component does not exist.

- [ ] **Step 3: Implement the LinkPreviewCard component**

Create `packages/client/src/components/post/LinkPreviewCard.vue`:

```vue
<template>
  <!-- Full preview card when link_preview data is available -->
  <div v-if="linkPreview" class="overflow-hidden rounded-lg border border-gray-700">
    <a
      :href="linkUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="flex transition-colors hover:border-primary"
    >
      <!-- Thumbnail -->
      <div
        v-if="linkPreview.image && !imageError"
        class="w-[120px] flex-shrink-0"
      >
        <img
          :src="linkPreview.image"
          :alt="linkPreview.title"
          loading="lazy"
          class="h-full w-full object-cover"
          @error="imageError = true"
        />
      </div>
      <div
        v-else
        data-testid="image-placeholder"
        class="flex w-[120px] flex-shrink-0 items-center justify-center bg-gradient-to-br from-primary/30 to-purple-500/30"
      >
        <svg class="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-2.51a4.5 4.5 0 00-6.364-6.364L4.5 8.257" />
        </svg>
      </div>

      <!-- Content -->
      <div class="flex min-w-0 flex-1 flex-col justify-center px-4 py-3">
        <div class="truncate text-sm font-semibold text-gray-100">
          {{ linkPreview.title }}
        </div>
        <div
          v-if="linkPreview.description"
          class="mt-1 line-clamp-2 text-xs text-gray-400"
        >
          {{ linkPreview.description }}
        </div>
        <div class="mt-2 flex items-center gap-3 text-xs text-gray-500">
          <span v-if="linkPreview.readingTime" class="flex items-center gap-1">
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" stroke-width="2" />
              <path stroke-width="2" d="M12 6v6l4 2" />
            </svg>
            {{ linkPreview.readingTime }} min read
          </span>
          <span class="flex items-center gap-1">
            <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            {{ domain }}
          </span>
        </div>
      </div>
    </a>

    <!-- Refresh button for author -->
    <button
      v-if="isAuthor"
      data-testid="refresh-preview"
      class="w-full border-t border-gray-700 px-4 py-1.5 text-xs text-gray-500 transition-colors hover:bg-gray-800 hover:text-gray-300"
      @click.prevent="$emit('refresh')"
    >
      Refresh preview
    </button>
  </div>

  <!-- Fallback: plain URL link -->
  <div v-else class="rounded-lg border border-gray-700 px-4 py-3">
    <a
      :href="linkUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
    >
      <svg class="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
      <span class="truncate">{{ linkUrl }}</span>
    </a>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { LinkPreview } from '@forge/shared';

const props = defineProps<{
  linkUrl: string;
  linkPreview: LinkPreview | null;
  isAuthor: boolean;
}>();

defineEmits<{ refresh: [] }>();

const imageError = ref(false);

const domain = computed(() => {
  try {
    return new URL(props.linkUrl).hostname;
  } catch {
    return props.linkUrl;
  }
});
</script>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && npx vitest run src/components/post/__tests__/LinkPreviewCard.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/LinkPreviewCard.vue packages/client/src/components/post/__tests__/LinkPreviewCard.test.ts
git commit -m "feat: add LinkPreviewCard component with OG data display and fallback"
```

---

### Task 7: PostListItem Link Icon

**Files:**
- Modify: `packages/client/src/components/post/PostListItem.vue`
- Modify or create: `packages/client/src/components/post/__tests__/PostListItem.test.ts`

- [ ] **Step 1: Write failing test for link icon**

Add to `packages/client/src/components/post/__tests__/PostListItem.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PostListItem from '../PostListItem.vue';

// Mock vue-router
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

// Mock window.matchMedia
vi.stubGlobal('window', {
  matchMedia: () => ({ matches: false }),
});

const basePost = {
  id: 'post-1',
  authorId: 'user-1',
  title: 'Test Post',
  contentType: 'snippet' as const,
  language: 'javascript',
  visibility: 'public' as const,
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'user-1', displayName: 'John', avatarUrl: null },
  tags: [],
  forkCount: 0,
  forkedFromTitle: null,
};

describe('PostListItem', () => {
  it('shows link icon for link content type', () => {
    const wrapper = mount(PostListItem, {
      props: {
        post: { ...basePost, contentType: 'link' as const },
        selected: false,
      },
    });
    expect(wrapper.find('[data-testid="link-icon"]').exists()).toBe(true);
  });

  it('does not show link icon for snippet content type', () => {
    const wrapper = mount(PostListItem, {
      props: { post: basePost, selected: false },
    });
    expect(wrapper.find('[data-testid="link-icon"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/client && npx vitest run src/components/post/__tests__/PostListItem.test.ts
```

Expected: FAIL — no element with `data-testid="link-icon"`.

- [ ] **Step 3: Add link icon to PostListItem**

Modify `packages/client/src/components/post/PostListItem.vue`. Replace the content type badge `<span>` (around line 60):

```vue
      <span
        class="flex items-center gap-1 rounded bg-gray-700 px-1.5 py-0.5 text-xs"
      >
        <svg
          v-if="post.contentType === 'link'"
          data-testid="link-icon"
          class="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
          />
        </svg>
        {{ post.contentType }}
      </span>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd packages/client && npx vitest run src/components/post/__tests__/PostListItem.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/post/PostListItem.vue packages/client/src/components/post/__tests__/PostListItem.test.ts
git commit -m "feat: add link icon badge to PostListItem for link-type posts"
```

---

### Task 8: Bruno API Tests

**Files:**
- Create: `bruno/posts/create-link-post.bru`
- Create: `bruno/posts/create-link-post-missing-url.bru`
- Create: `bruno/posts/refresh-link-preview.bru`
- Create: `bruno/posts/refresh-link-preview-forbidden.bru`

- [ ] **Step 1: Create happy-path link post creation test**

Create `bruno/posts/create-link-post.bru`:

```
meta {
  name: Create Link Post
  type: http
  seq: 7
}

post {
  url: {{baseUrl}}/api/posts
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "title": "TypeScript Handbook",
    "contentType": "link",
    "linkUrl": "https://www.typescriptlang.org/docs/handbook/intro.html",
    "isDraft": false,
    "visibility": "public"
  }
}

assert {
  res.status: eq 201
  res.body.post.contentType: eq link
  res.body.post.linkUrl: eq https://www.typescriptlang.org/docs/handbook/intro.html
}

script:post-response {
  if (res.body?.post?.id) {
    bru.setVar("createdLinkPostId", res.body.post.id);
  }
}
```

- [ ] **Step 2: Create missing-linkUrl validation test**

Create `bruno/posts/create-link-post-missing-url.bru`:

```
meta {
  name: Create Link Post - Missing URL
  type: http
  seq: 8
}

post {
  url: {{baseUrl}}/api/posts
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "title": "Missing URL Link",
    "contentType": "link",
    "isDraft": false,
    "visibility": "public"
  }
}

assert {
  res.status: eq 400
}
```

- [ ] **Step 3: Create refresh-preview happy-path test**

Create `bruno/posts/refresh-link-preview.bru`:

```
meta {
  name: Refresh Link Preview
  type: http
  seq: 9
}

post {
  url: {{baseUrl}}/api/posts/{{createdLinkPostId}}/refresh-preview
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 200
  res.body.post.contentType: eq link
}
```

- [ ] **Step 4: Create refresh-preview forbidden test**

Create `bruno/posts/refresh-link-preview-forbidden.bru`:

```
meta {
  name: Refresh Link Preview - Forbidden
  type: http
  seq: 10
}

post {
  url: {{baseUrl}}/api/posts/{{postId}}/refresh-preview
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 403
}
```

Note: `{{postId}}` points to the seeded post owned by testuser. This test will return 400 (not a link post) or 403 depending on the seeded post's content type. If the seeded post is a snippet, adjust this to test against a post owned by a different user. Check the seed data and adjust accordingly during implementation.

- [ ] **Step 5: Add `createdLinkPostId` to local environment**

Add to `bruno/environments/local.bru`:

```
createdLinkPostId:
```

- [ ] **Step 6: Commit**

```bash
git add bruno/posts/create-link-post.bru bruno/posts/create-link-post-missing-url.bru bruno/posts/refresh-link-preview.bru bruno/posts/refresh-link-preview-forbidden.bru bruno/environments/local.bru
git commit -m "test(bruno): add API tests for link post creation and preview refresh"
```

---

### Task 9: Coverage Verification & Cleanup

**Files:**
- All test files from previous tasks

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm run test:coverage
```

Expected: ALL PASS with coverage meeting `.coverage-thresholds.json` thresholds (100% lines, branches, functions, statements).

- [ ] **Step 2: Fix any coverage gaps**

If any lines/branches are uncovered, add targeted tests to cover them. Common gaps:
- Error paths in `fetchWithSafety` (redirect handling edge cases)
- The `catch` block in `domain` computed property in `LinkPreviewCard.vue`

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

Expected: No errors.

- [ ] **Step 4: Run build**

```bash
npm run build
```

Expected: No TypeScript errors.

- [ ] **Step 5: Run Bruno API tests against running server**

```bash
# Start server in background
set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts &

# Run Bruno tests
cd bruno && npx @usebruno/cli run posts --env local

# Stop server
kill %1
```

Expected: All Bruno requests return their asserted status codes.

- [ ] **Step 6: Final commit if any coverage fixes were needed**

```bash
git add -A
git commit -m "test: achieve 100% coverage for link preview feature"
```

---

## Summary

| Task | Description | Key Files |
|---|---|---|
| 1 | Install dependencies | `packages/server/package.json` |
| 2 | Extend shared validators | `packages/shared/src/validators/post.ts` |
| 3 | Extend DB queries | `packages/server/src/db/queries/posts.ts` |
| 4 | Link preview service (SSRF + OG) | `packages/server/src/services/link-preview.ts` |
| 5 | Route integration + refresh endpoint | `packages/server/src/routes/posts.ts` |
| 6 | LinkPreviewCard component | `packages/client/src/components/post/LinkPreviewCard.vue` |
| 7 | PostListItem link icon | `packages/client/src/components/post/PostListItem.vue` |
| 8 | Bruno API tests | `bruno/posts/*.bru` |
| 9 | Coverage verification & cleanup | All test files |
