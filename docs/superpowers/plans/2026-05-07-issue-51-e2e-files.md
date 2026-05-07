# Issue #51 — E2E files + multi-file posts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Per CLAUDE.md the user always picks the execution method — do not auto-select.**

**Goal:** Ship a 13-spec Playwright suite under `e2e/specs/files/` covering drag-drop / file-picker upload, multi-file posts, preview rendering for json/yaml/md/code/image, replace, remove, oversize rejection, mime rejection, and in-post rendering — all stable at workers=4.

**Architecture:** Two work streams.

1. **Client surface work** — add minimal `data-testid` hooks and the missing affordances (file remove button, server-error display) so the existing UI is testable. No new routes, no new server endpoints.
2. **Spec authoring** — one spec per DoD scenario, all rooted at the per-worker `actor` fixture and using unique-per-test filenames so MinIO state from prior runs cannot collide.

**Tech Stack:** Playwright 1.x (test, expect, setInputFiles, dispatchEvent('drop')), Vue 3 (FileUpload, FilePreview, FileSidebar, PostEditor, PostViewPage), Pinia files store, MinIO (server-side, untouched), Vitest unit-test additions for new client UI.

---

## Pre-implementation: file scope

```
e2e/specs/files/                                            (NEW — 13 active + 1 fixme = 14 spec files)
e2e/fixtures/selectors/files.ts                             (NEW — selector shard)
e2e/fixtures/files/                                         (NEW — sample.json, sample.yaml, sample.md, sample.ts, sample.png)
e2e/specs/posts/multi-file-upload.spec.ts                   (DELETE — migrated)
e2e/specs/posts/multi-file-preview.spec.ts                  (DELETE — migrated)
e2e/specs/posts/multi-file-rendering-in-post.spec.ts        (DELETE — migrated)
packages/client/src/components/post/FileUpload.vue          (MODIFY — add testid on input + error span)
packages/client/src/components/post/FilePreview.vue         (MODIFY — add testids on rendered output variants)
packages/client/src/components/post/FileSidebar.vue         (MODIFY — add testids on items + remove button when editable=true)
packages/client/src/components/editor/PostEditor.vue        (MODIFY — wrap all 3 upload entry points in try/catch; add server-error UI; wire remove handler)
packages/client/src/__tests__/components/post/FileSidebar.test.ts        (MODIFY/NEW — cover remove button)
packages/client/src/__tests__/components/post/FilePreview.test.ts        (MODIFY/NEW — cover preview testids)
packages/client/src/__tests__/components/editor/PostEditor.test.ts       (MODIFY — cover all branches of friendlyUploadError + handleFileRemove)
.beads/plans/active-plan.md                                 (REPLACE — point to this plan)
```

**Out of scope:** server changes, new routes, mime allowlist edits, MinIO config, Bruno collection (no new endpoints), other feature folders, `superpowers:` skill changes.

**Reconciliation note (DoD vs spec budget — REVISED after plan-review-gate iteration 1):** The DoD enumerates 14 scenarios. The issue caps the folder at 9–13 specs (±15% of 11). There is no download-as-attachment UI in the codebase (verified — zero matches for `download` UI patterns in `packages/client/src/`). Per the documented `pattern-dod-missing-feature-fixme` (`.beads/knowledge/patterns.jsonl`), the canonical response when a DoD bullet depends on a missing feature is: write the spec, run it red, convert to `test.fixme()`, and file a follow-up issue. The plan ships **14 spec files**:

- 13 active specs (covering all DoD bullets except download)
- 1 `download.spec.ts` as `test.fixme()` with a citation comment to a new follow-up issue (Task 12.5 + Task 13 step 8)

The runtime budget (90s at workers=4) is unaffected by the fixme'd spec because it does not execute. If the user prefers a strict 13-cap, drop `download.spec.ts` and accept the documented gap — but keep the follow-up issue. Decision deferred to user via the Execution Handoff at the end of this plan.

---

## Pre-implementation gotchas (must read before Task 1)

- **SPA navigation preserves Pinia; hard navigation does not.** PostEditPage does NOT call `filesStore.fetchFiles` or any staged-files hydration on mount (verified: only `fetchPost(id)` runs in `onMounted`). Any spec that hard-navigates to `/posts/:id/edit` lands with empty `filesStore.stagedFiles`, and `<FileSidebar>` (`v-if="filesStore.stagedFiles.length > 0"`) is NOT rendered. Specs that need an editable FileSidebar MUST either (a) reach `/edit` via SPA navigation (`router-link` click — verified `PostViewPage.vue:194` uses `<router-link :to="{ name: 'post-edit' ... }">`) so Pinia state survives, OR (b) upload a fresh file via `<input data-testid="file-upload-input">` after arriving on `/edit`, which populates `stagedFiles` live. Tasks 9–12 all use approach (b): they save an EMPTY draft, navigate to `/edit` (hard or SPA — irrelevant because stagedFiles is empty either way at that point), then upload the seed file via the editor input which populates `filesStore.stagedFiles` and renders the sidebar.
- **MinIO state is sticky.** No reset between tests. Every spec that uploads MUST use a name like `${testInfo.title.replace(/[^a-z0-9]/gi, '-')}-${Date.now()}-${random()}.<ext>` so two specs (or two retries) cannot collide.
- **`actor` is per-worker.** One of `e2e_w0..e2e_w3` per `testInfo.parallelIndex`. Never reach for `testuser` — there is a CI lint guard at `.github/workflows/e2e-playwright.yml:79` that fails the workflow if any spec under `e2e/specs/` matches `testuser@example.com`, `storageStatePath('testuser')`, or `SEED_USERS.testuser`.
- **No drag from desktop.** Playwright cannot drive a real OS-level drag. The drag-drop spec dispatches a synthetic `drop` event with a JS-side `DataTransfer`, while the file-picker spec uses `setInputFiles` directly on the hidden `<input data-testid="file-upload-input">`.
- **The new-post page does not auto-show `<FileSidebar>`.** `showFileSidebar` is `computed(() => filesStore.stagedFiles.length > 0)` and `filesStore` is only populated AFTER `postId` exists. New-post uploads go through `<input data-testid="file-upload-input">` → `localStagedFiles` and render inline with `data-testid="file-upload-preview"`. Tests that need `<FileSidebar>` must operate on a saved/published post (`/posts/:id/edit`).
- **`PostDetail.vue` mounts `<FilePreview>`; `PostViewPage.vue` does NOT.** Inline preview content lives on the HomePage post-detail panel. `PostViewPage` (`/posts/:id`) renders a flat `<ul data-testid="post-file-list">` of filenames only — no preview, no download link. The "in-post rendering" spec asserts on `post-file-list`. The 5 preview specs and the replace spec drive the editor or HomePage panel, not `/posts/:id`.
- **MIME server rejection is 415.** `packages/server/src/routes/files.ts:55` returns `{ error: 'Unsupported media type' }`. The store's `uploadFile` rejects on non-201. Currently `PostEditor.handleFileUpload` and `handleDrop` await without `.catch()`, so server rejections produce unhandled promise rejections and no UI. Task 4 adds the catch + display.
- **Oversize rejection has TWO paths.** Client-side: `FileUpload.vue:48-51` checks `file.size > 10MB` and sets `errorMessage` (no testid yet). Server-side: 413 with `{ error: 'File too large' }`. The oversize spec exercises the **client-side** path because the input never reaches the server.
- **Two distinct file inputs both need testids.** PostEditor.vue:188 has `<input data-testid="file-upload-input">` (handler: `handleLocalFileChange`, calls `filesStore.uploadFile` directly with no client-side size validation). The FileUpload component (`packages/client/src/components/post/FileUpload.vue:19`) has its OWN hidden `<input>` (handler: `handleFileSelect → validateAndEmit`, which DOES enforce the 10MB limit client-side at `FileUpload.vue:48-51`). Today, ONLY the editor-level input has a testid. Task 3 step 5 adds `data-testid="file-upload-input-sidebar"` to the FileUpload component's input so the oversize spec can drive the client-side validation path explicitly. Mime-rejection (server-side 415) drives the editor-level input because it goes through `handleLocalFileChange → filesStore.uploadFile → server → 415` and surfaces via PostEditor's new `file-upload-error` UI.
- **Synthetic large file.** Build the 11MB buffer in the spec via `Buffer.alloc(11 * 1024 * 1024, 0x61)` and pass to `setInputFiles({ name, mimeType, buffer })`. Do NOT commit a 10MB+ fixture.
- **`sample.png` MUST be a real PNG.** The server runs `fileTypeFromBuffer` on `image/*` uploads (`packages/server/src/routes/files.ts:71-79`) and rejects MIME/magic-byte mismatch with 415. Generate it once with sharp/pngjs or commit a tiny known-good PNG (≤1KB).
- **`createPostSchema` requires `content`.** Snippet/document posts cannot be saved as drafts with empty bodies. Every spec that creates a post via the UI must `posts.newPostBody(actor).fill('placeholder')` before clicking Save Draft. (Existing pattern; see `e2e/specs/posts/multi-file-rendering-in-post.spec.ts:14`.)
- **Playwright infers MIME from file extension via `mime-types`; `.ts` resolves to `video/mp2t`.** That MIME is NOT in the server allowlist (`packages/shared/src/validators/file.ts`: `text/x-` prefix matches `text/x-typescript`, but Playwright resolves `.ts` to `video/mp2t`). When uploading via path-form `setInputFiles('/path/to/sample.ts')`, the upload is rejected with HTTP 415. Two workarounds: (a) use a fixture with a benign extension (`.md`, `.json`, `.yaml` all resolve to allowed MIME types), or (b) use buffer-form `setInputFiles({ name, mimeType: 'text/x-typescript', buffer: readFileSync(path) })` to override the inferred MIME. Tasks that upload TypeScript content (Task 8 preview-code) MUST use approach (b). Verified by Task 5 implementer empirically.
- **Concurrent uploads need ordering.** Per `pattern-queue-parallel-uploads`, sequential `await uploadFile(...)` calls are deterministic; parallel `Promise.all([upload, upload])` race the server's `getNextSortOrder`. The multi-file spec uploads sequentially.

---

## Task 1: Persist active plan + create selector shard scaffold

**Files:**

- Modify: `.beads/plans/active-plan.md`
- Create: `e2e/fixtures/selectors/files.ts`

- [ ] **Step 1: Replace `.beads/plans/active-plan.md`** with metadata pointing at this plan and #51:

```markdown
---
title: 'Issue #51 — E2E files + multi-file posts'
issue: 51
tracking-issue: 43
status: in-progress
plan-file: docs/superpowers/plans/2026-05-07-issue-51-e2e-files.md
design-file: docs/superpowers/specs/2026-04-28-e2e-playwright-testing-design.md
branch: feat/e2e-files
base: main
design-review-gate: APPROVED 2026-04-28 (parent design — see tracking issue #43)
plan-review-gate: <fill in after gate passes>
user-approved: <fill in after user approves>
execution-method: <fill in after user picks>
---

# Active plan — Issue #51

The full implementation plan is at `docs/superpowers/plans/2026-05-07-issue-51-e2e-files.md`.
```

- [ ] **Step 2: (no commit) — `.beads/plans/active-plan.md` is gitignored.**

Verified: `.gitignore:24` ignores `.beads/plans/`. This is intentional — per CLAUDE.md "Context Recovery (Surviving Compaction)", active-plan.md is local-only persistence for agent recovery, never tracked. The file persists on disk for the lifetime of this branch's local workspace, which is sufficient for its purpose. Skip the commit attempt; do NOT use `git add -f` to bypass the ignore.

- [ ] **Step 3: Create `e2e/fixtures/selectors/files.ts`** as a stub. (Selectors are added incrementally as later tasks need them; starting empty avoids dead exports.)

```ts
import type { Page, Locator } from '@playwright/test';

/**
 * Selectors for the files feature folder. Mirrors the `posts` shard pattern
 * (`e2e/fixtures/selectors/posts.ts`). New testids are added by the tasks
 * below as the underlying components gain them.
 */
export const files = {
  // Upload entry points (already exist on PostEditor)
  fileUploadInput: (page: Page): Locator => page.getByTestId('file-upload-input'),
  fileUploadPreview: (page: Page): Locator => page.getByTestId('file-upload-preview'),
  editorDropZone: (page: Page): Locator => page.getByTestId('editor-drop-zone'),
  // Published-post listing (already exists on PostViewPage)
  postFileList: (page: Page): Locator => page.getByTestId('post-file-list'),
};
```

- [ ] **Step 4: Type-check.**

```bash
cd e2e && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5: Commit.**

```bash
git add e2e/fixtures/selectors/files.ts
git commit -m "test(e2e): #51 add files selector shard scaffold"
```

---

## Task 2: Add fixture sample files

**Files:**

- Create: `e2e/fixtures/files/sample.json`
- Create: `e2e/fixtures/files/sample.yaml`
- Create: `e2e/fixtures/files/sample.md`
- Create: `e2e/fixtures/files/sample.ts`
- Create: `e2e/fixtures/files/sample.png`

- [ ] **Step 1: Create `e2e/fixtures/files/sample.json`** with a deterministic key the preview spec can grep for:

```json
{
  "marker": "e2e-json-fixture",
  "value": 42
}
```

- [ ] **Step 2: Create `e2e/fixtures/files/sample.yaml`**:

```yaml
marker: e2e-yaml-fixture
value: 42
```

- [ ] **Step 3: Create `e2e/fixtures/files/sample.md`**:

```markdown
# e2e-md-fixture

Body line with **bold** marker.
```

- [ ] **Step 4: Create `e2e/fixtures/files/sample.ts`**:

```ts
export const marker = 'e2e-ts-fixture';
export function id<T>(value: T): T {
  return value;
}
```

- [ ] **Step 5: Create `e2e/fixtures/files/sample.png`** as a real 1x1 PNG (NOT a renamed text file — the server runs `fileTypeFromBuffer` and rejects mismatches). Use Node:

```bash
node -e "const fs=require('node:fs');const b=Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63f8cf000000010001a0c1ec480000000049454e44ae426082','hex');fs.writeFileSync('e2e/fixtures/files/sample.png', b);"
```

- [ ] **Step 6: Verify the PNG is valid:**

```bash
file e2e/fixtures/files/sample.png
```

Expected: `e2e/fixtures/files/sample.png: PNG image data, 1 x 1, ...`

- [ ] **Step 7: Verify total fixture size is under 100KB:**

```bash
du -ch e2e/fixtures/files/sample.* | tail -1
```

Expected: well under 100K (each file is tiny).

- [ ] **Step 8: Commit.** (No fixture README — CLAUDE.md forbids unrequested documentation files. The protective rules — "fixtures < 100KB", "PNG must be real" — live in this plan's Pre-implementation gotchas section and as inline comments in the specs that consume them.)

```bash
git add e2e/fixtures/files/
git commit -m "test(e2e): #51 add fixture files for upload specs"
```

---

## Task 3: Add testids on existing file UI surfaces (no behavior change)

**Files:**

- Modify: `packages/client/src/components/post/FileUpload.vue`
- Modify: `packages/client/src/components/post/FilePreview.vue`
- Modify: `packages/client/src/components/post/FileSidebar.vue`
- Modify: `packages/client/src/__tests__/components/post/FilePreview.test.ts` (or create if absent)
- Modify: `packages/client/src/__tests__/components/post/FileSidebar.test.ts` (or create if absent)
- Modify: `e2e/fixtures/selectors/files.ts` (add new selectors)

- [ ] **Step 1: Write failing unit test for FilePreview testids.**

Add a test to `packages/client/src/__tests__/components/post/FilePreview.test.ts` (create the file if it does not exist; mirror the pattern from `packages/client/src/__tests__/components/post/PostActions.test.ts`):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import FilePreview from '@/components/post/FilePreview.vue';

describe('FilePreview testid surfaces', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch' as never).mockImplementation(
      // returns a json body for a .json file
      async () => new Response('{"hello":"world"}', { status: 200 }),
    );
  });

  it('renders the code variant with file-preview-code testid for .json', async () => {
    const wrapper = mount(FilePreview, {
      props: {
        file: {
          id: 'f1',
          filename: 'a.json',
          mimeType: 'application/json',
          fileSize: 17,
        } as unknown as never,
        postId: 'p1',
      },
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="file-preview-code"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — confirm it fails:**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/FilePreview.test.ts
```

Expected: FAIL — `file-preview-code` not present.

- [ ] **Step 3: Edit `packages/client/src/components/post/FilePreview.vue`** to add testids on each output variant:

```vue
<!-- Image preview -->
<div
  v-else-if="isImage"
  data-testid="file-preview-image"
  class="flex items-center justify-center p-4"
>
  <img :src="imageUrl" :alt="file.filename" class="max-w-full rounded" />
</div>

<!-- Syntax-highlighted code (including JSON, YAML) -->
<div
  v-else-if="highlightedHtml"
  data-testid="file-preview-code"
  class="rounded text-sm"
  v-html="highlightedHtml"
/>

<!-- Markdown rendered -->
<div
  v-else-if="renderedMarkdown"
  data-testid="file-preview-markdown"
  class="prose prose-invert max-w-none p-4"
  v-html="renderedMarkdown"
/>

<!-- Plain text fallback -->
<pre
  v-else
  data-testid="file-preview-text"
  class="whitespace-pre-wrap p-4 font-mono text-sm text-gray-300">{{ content }}</pre>
```

- [ ] **Step 4: Re-run the test — expect PASS:**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/FilePreview.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add testids on the FileUpload component (input + error span).**

Edit `packages/client/src/components/post/FileUpload.vue`:

- Line 19 — add a distinct testid to the hidden input so the oversize spec can drive THIS handler (which enforces the client-side 10MB limit), not the editor-level input that bypasses it:

```vue
<input
  ref="fileInputRef"
  data-testid="file-upload-input-sidebar"
  type="file"
  multiple
  class="hidden"
  @change="handleFileSelect"
/>
```

- Line 20 — add testid to the error span:

```vue
<p v-if="errorMessage" data-testid="file-upload-client-error" class="mt-1 text-xs text-red-400">
  {{ errorMessage }}
</p>
```

- [ ] **Step 5.5: Add `multiple` attribute to PostEditor's editor-level file input.**

Edit `packages/client/src/components/editor/PostEditor.vue` lines 187-192:

```vue
<input
  data-testid="file-upload-input"
  type="file"
  multiple
  class="sr-only"
  @change="handleLocalFileChange"
/>
```

The `multiple` attribute is required for Task 7 (multi-file post spec) to stage 3 files in one `setInputFiles([...])` call. Playwright's `setInputFiles` with an array on a non-multiple input either fails or silently keeps only the last entry. The corresponding `handleLocalFileChange` already loops over `files` (`PostEditor.vue:78` — `for (const file of Array.from(files))`), so no JS changes are needed. This addition is within the issue's authorized `editor/**` scope.

- [ ] **Step 6: Add a sidebar item testid (no remove button yet — that lands in Task 4).**

Edit `packages/client/src/components/post/FileSidebar.vue` button:

```vue
<button
  v-for="file in files"
  :key="file.id"
  :data-testid="`file-sidebar-item-${file.filename}`"
  class="..."
  ...
>
```

- [ ] **Step 7: Add the new selectors to `e2e/fixtures/selectors/files.ts`:**

```ts
// Append to the `files` object:
filePreviewImage: (page: Page): Locator => page.getByTestId('file-preview-image'),
filePreviewCode: (page: Page): Locator => page.getByTestId('file-preview-code'),
filePreviewMarkdown: (page: Page): Locator => page.getByTestId('file-preview-markdown'),
filePreviewText: (page: Page): Locator => page.getByTestId('file-preview-text'),
fileUploadClientError: (page: Page): Locator => page.getByTestId('file-upload-client-error'),
fileUploadInputSidebar: (page: Page): Locator => page.getByTestId('file-upload-input-sidebar'),
fileSidebarItem: (page: Page, filename: string): Locator =>
  page.getByTestId(`file-sidebar-item-${filename}`),
```

- [ ] **Step 8: Run the full client unit suite + e2e typecheck:**

```bash
cd packages/client && npm test
cd e2e && npx tsc --noEmit
```

Expected: all pass.

- [ ] **Step 9: Commit.**

```bash
git add packages/client/src/components/post/FilePreview.vue \
        packages/client/src/components/post/FileUpload.vue \
        packages/client/src/components/post/FileSidebar.vue \
        packages/client/src/__tests__/components/post/FilePreview.test.ts \
        e2e/fixtures/selectors/files.ts
git commit -m "feat(client): #51 add data-testid hooks for E2E file specs"
```

---

## Task 4: Add file-remove UI in FileSidebar (editable mode) + server-error UI in PostEditor

**Files:**

- Modify: `packages/client/src/components/post/FileSidebar.vue`
- Modify: `packages/client/src/components/editor/PostEditor.vue`
- Modify: `packages/client/src/__tests__/components/post/FileSidebar.test.ts`
- Modify: `packages/client/src/__tests__/components/editor/PostEditor.test.ts`
- Modify: `e2e/fixtures/selectors/files.ts`

> **Why both UI changes in one task:** they share a single commit boundary — both add user-facing affordances that the spec layer needs. Splitting them creates intermediate commits where E2E specs would still fail because half the affordances are missing.
>
> **Scope justification (DoD-mandated, not creep):**
>
> - **Remove button** — DoD bullet "remove (delete from post)" is untestable without a UI affordance. `filesStore.deleteStagedFile` exists at `packages/client/src/stores/files.ts:77` but no UI invokes it (verified via grep). The button is the minimal addition required.
> - **Server-error UI** — DoD bullet "mime rejection (disallowed mime type rejected)" with a "friendly error" requires a place for that error to render. PostEditor's three upload handlers currently all do `void filesStore.uploadFile(...)` with no `.catch()` (verified at `PostEditor.vue:60-86`); 415/413 responses produce unhandled rejections and no UI feedback. The new `fileUploadError` ref + `<p data-testid="file-upload-error">` is the minimal addition.
>
> Both surfaces stay within the issue's authorized scope (`packages/client/src/components/post/**` and `editor/**`). No server changes; no new routes.

- [ ] **Step 1: Failing unit test — FileSidebar emits `remove` when remove button clicked, only when editable=true.**

In `packages/client/src/__tests__/components/post/FileSidebar.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileSidebar from '@/components/post/FileSidebar.vue';

const baseFile = { id: 'f1', filename: 'a.json', fileSize: 100 };

describe('FileSidebar remove button', () => {
  it('renders remove button only when editable=true', () => {
    const ed = mount(FileSidebar, {
      props: { files: [baseFile], activeFileId: null, editable: true },
    });
    expect(ed.find('[data-testid="file-remove-btn-a.json"]').exists()).toBe(true);

    const ro = mount(FileSidebar, {
      props: { files: [baseFile], activeFileId: null, editable: false },
    });
    expect(ro.find('[data-testid="file-remove-btn-a.json"]').exists()).toBe(false);
  });

  it('emits remove with file id when clicked', async () => {
    const w = mount(FileSidebar, {
      props: { files: [baseFile], activeFileId: null, editable: true },
    });
    await w.find('[data-testid="file-remove-btn-a.json"]').trigger('click');
    expect(w.emitted('remove')).toEqual([['f1']]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

```bash
cd packages/client && npx vitest run src/__tests__/components/post/FileSidebar.test.ts
```

- [ ] **Step 3: Implement remove button + emit in `FileSidebar.vue`.**

Replace the existing `<button v-for="...">` block with a row that contains both a select-button and a remove-button (only when editable):

```vue
<div v-for="file in files" :key="file.id" class="flex w-full items-center gap-1">
  <button
    :data-testid="`file-sidebar-item-${file.filename}`"
    class="flex flex-1 items-center justify-between rounded px-2 py-1.5 text-left text-sm transition-colors"
    :class="
      file.id === activeFileId
        ? 'border-l-2 border-purple-500 bg-purple-500/20 text-purple-300'
        : 'text-gray-400 hover:bg-gray-800'
    "
    @click="$emit('select', file.id)"
  >
    <span class="truncate">{{ file.filename }}</span>
    <span class="ml-2 flex-shrink-0 text-xs text-gray-600">{{ formatSize(file.fileSize) }}</span>
  </button>
  <button
    v-if="editable"
    :data-testid="`file-remove-btn-${file.filename}`"
    class="rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-red-900/30 hover:text-red-400"
    aria-label="Remove file"
    @click="$emit('remove', file.id)"
  >
    ×
  </button>
</div>
```

And add `remove` to the emits declaration:

```ts
defineEmits<{
  select: [fileId: string];
  remove: [fileId: string];
}>();
```

- [ ] **Step 4: Re-run — expect PASS.**

- [ ] **Step 5: Wire the remove emit in PostEditor.**

In `packages/client/src/components/editor/PostEditor.vue` template (the editable `<FileSidebar>` block around line 213):

```vue
<FileSidebar
  v-if="showFileSidebar"
  :files="filesStore.stagedFiles"
  :active-file-id="filesStore.activeFileId"
  :editable="true"
  @select="filesStore.setActiveFile"
  @remove="handleFileRemove"
>
```

And add the handler in the `<script setup>`:

```ts
async function handleFileRemove(fileId: string): Promise<void> {
  if (!props.postId) return;
  try {
    await filesStore.deleteStagedFile(props.postId, fileId);
  } catch (err) {
    fileUploadError.value = friendlyUploadError(err);
  }
}
```

- [ ] **Step 6: Failing unit tests — PostEditor displays the server-error UI for every error class, plus full branch coverage of `friendlyUploadError` and `handleFileRemove`.**

The 100% branch-coverage gate (`.coverage-thresholds.json`) requires test cases for **all branches** introduced in this task: 3 branches of `friendlyUploadError` (415, 413, fallback) plus the success and error paths of `handleFileRemove` and the catch path of `handleLocalFileChange`. Add to `packages/client/src/__tests__/components/editor/PostEditor.test.ts` (mirror the existing test file's mount harness):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PostEditor from '@/components/editor/PostEditor.vue';
import { useFilesStore } from '@/stores/files';

const baseProps = {
  modelValue: '',
  title: 'T',
  language: 'typescript',
  visibility: 'public' as const,
  contentType: 'snippet' as const,
  tags: [] as string[],
  saveStatus: 'idle' as const,
  lastSavedAt: null,
  postId: 'p1',
};

describe('PostEditor server-error UI', () => {
  beforeEach(() => setActivePinia(createPinia()));

  async function uploadAndExpect(message: string, regex: RegExp) {
    const filesStore = useFilesStore();
    vi.spyOn(filesStore, 'uploadFile').mockRejectedValue(new Error(message));
    const wrapper = mount(PostEditor, { props: baseProps });
    const input = wrapper.find<HTMLInputElement>('[data-testid="file-upload-input"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'a.txt', { type: 'text/plain' })],
    });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="file-upload-error"]').text()).toMatch(regex);
  }

  it('renders the 415 friendly message', () =>
    uploadAndExpect('Upload failed: 415', /unsupported file type/i));
  it('renders the 413 friendly message', () =>
    uploadAndExpect('Upload failed: 413', /file too large/i));
  it('renders the generic fallback for non-415/413 errors', () =>
    uploadAndExpect('boom', /upload failed/i));
  it('handles non-Error rejection values', async () => {
    const filesStore = useFilesStore();
    vi.spyOn(filesStore, 'uploadFile').mockRejectedValue('string-rejection');
    const wrapper = mount(PostEditor, { props: baseProps });
    const input = wrapper.find<HTMLInputElement>('[data-testid="file-upload-input"]');
    Object.defineProperty(input.element, 'files', {
      value: [new File(['x'], 'a.txt', { type: 'text/plain' })],
    });
    await input.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="file-upload-error"]').text()).toMatch(/upload failed/i);
  });
});

describe('PostEditor handleFileRemove', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('calls filesStore.deleteStagedFile with postId and fileId', async () => {
    const filesStore = useFilesStore();
    const spy = vi.spyOn(filesStore, 'deleteStagedFile').mockResolvedValue(undefined);
    filesStore.stagedFiles = [{ id: 'f1', filename: 'a.json', fileSize: 10 }] as never;
    const wrapper = mount(PostEditor, { props: baseProps });
    await wrapper.find('[data-testid="file-remove-btn-a.json"]').trigger('click');
    expect(spy).toHaveBeenCalledWith('p1', 'f1');
  });

  it('surfaces a friendly error when delete rejects', async () => {
    const filesStore = useFilesStore();
    vi.spyOn(filesStore, 'deleteStagedFile').mockRejectedValue(new Error('Network'));
    filesStore.stagedFiles = [{ id: 'f1', filename: 'a.json', fileSize: 10 }] as never;
    const wrapper = mount(PostEditor, { props: baseProps });
    await wrapper.find('[data-testid="file-remove-btn-a.json"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="file-upload-error"]').text()).toMatch(
      /upload failed|network/i,
    );
  });

  it('is a no-op when postId is undefined', async () => {
    const filesStore = useFilesStore();
    const spy = vi.spyOn(filesStore, 'deleteStagedFile');
    filesStore.stagedFiles = [{ id: 'f1', filename: 'a.json', fileSize: 10 }] as never;
    const wrapper = mount(PostEditor, { props: { ...baseProps, postId: undefined } });
    await wrapper.find('[data-testid="file-remove-btn-a.json"]').trigger('click');
    expect(spy).not.toHaveBeenCalled();
  });
});
```

Adjust `handleFileRemove` if needed so it accepts a non-Error rejection (cover via `friendlyUploadError`'s shared branching). The key invariant: **every new branch added in this task has a test asserting it.**

- [ ] **Step 7: Implement server-error UI in PostEditor.**

Add to `<script setup>`:

```ts
const fileUploadError = ref<string | null>(null);

function friendlyUploadError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/415/.test(msg))
    return 'Unsupported file type. JSON, YAML, Markdown, plain text, code, and images (PNG/JPEG/GIF/WebP) are allowed.';
  if (/413/.test(msg)) return 'File too large. Maximum size is 10 MB.';
  return 'Upload failed. Please try again.';
}
```

Wrap **all three** upload entry points in try/catch. Replace the existing `handleDrop`, `handleFileUpload`, and `handleLocalFileChange` (current source: `PostEditor.vue:60-86`) with these versions — note that `handleLocalFileChange` is the handler bound to `<input data-testid="file-upload-input">` and is the path the mime spec drives, so it MUST be patched:

```ts
function handleDrop(e: DragEvent): void {
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (!files || files.length === 0 || !props.postId) return;
  fileUploadError.value = null;
  for (const file of Array.from(files)) {
    void filesStore.uploadFile(props.postId, file).catch((err) => {
      fileUploadError.value = friendlyUploadError(err);
    });
  }
}

async function handleFileUpload(file: File): Promise<void> {
  if (!props.postId) return;
  fileUploadError.value = null;
  try {
    await filesStore.uploadFile(props.postId, file);
  } catch (err) {
    fileUploadError.value = friendlyUploadError(err);
  }
}

function handleLocalFileChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  fileUploadError.value = null;
  for (const file of Array.from(files)) {
    if (props.postId) {
      void filesStore.uploadFile(props.postId, file).catch((err) => {
        fileUploadError.value = friendlyUploadError(err);
      });
    } else {
      localStagedFiles.value.push(file);
      emit('local-file-staged', file);
    }
  }
}
```

In the template, render the error near the upload input:

```vue
<p v-if="fileUploadError" data-testid="file-upload-error" class="mt-1 text-xs text-red-400">
  {{ fileUploadError }}
</p>
```

- [ ] **Step 8: Re-run unit suite — expect PASS:**

```bash
cd packages/client && npm test
```

- [ ] **Step 9: Add the new selectors to `e2e/fixtures/selectors/files.ts`:**

```ts
fileRemoveBtn: (page: Page, filename: string): Locator =>
  page.getByTestId(`file-remove-btn-${filename}`),
fileUploadError: (page: Page): Locator => page.getByTestId('file-upload-error'),
```

- [ ] **Step 10: Coverage gate.**

```bash
npm run test:coverage
```

Expected: lines/branches/functions/statements all ≥ 100% per `.coverage-thresholds.json`. If new branches are uncovered, add tests before moving on.

- [ ] **Step 11: Commit.**

```bash
git add packages/client/src/components/post/FileSidebar.vue \
        packages/client/src/components/editor/PostEditor.vue \
        packages/client/src/__tests__/components/post/FileSidebar.test.ts \
        packages/client/src/__tests__/components/editor/PostEditor.test.ts \
        e2e/fixtures/selectors/files.ts
git commit -m "feat(client): #51 add file remove button + server-error UI"
```

---

## Task 5: Migrate the 3 existing `posts/multi-file-*` specs into `files/`

**Why this exists:** `e2e/specs/posts/multi-file-{upload,preview,rendering-in-post}.spec.ts` were placeholder smoke tests landed earlier. Per the issue's coverage matrix, file-related specs belong in `e2e/specs/files/`. Migrating instead of deleting + recreating preserves git history and avoids a temporary coverage regression.

**Files:**

- Move: `e2e/specs/posts/multi-file-upload.spec.ts` → `e2e/specs/files/file-picker-upload.spec.ts`
- Move: `e2e/specs/posts/multi-file-preview.spec.ts` → `e2e/specs/files/preview-filename.spec.ts` (renamed; folded into Task 6 if redundant — see step 4)
- Move: `e2e/specs/posts/multi-file-rendering-in-post.spec.ts` → `e2e/specs/files/in-post-rendering.spec.ts`

- [ ] **Step 1: Create `e2e/specs/files/` directory.**

```bash
mkdir -p e2e/specs/files
```

- [ ] **Step 2: Use `git mv` to preserve history:**

```bash
git mv e2e/specs/posts/multi-file-upload.spec.ts e2e/specs/files/file-picker-upload.spec.ts
git mv e2e/specs/posts/multi-file-rendering-in-post.spec.ts e2e/specs/files/in-post-rendering.spec.ts
git rm e2e/specs/posts/multi-file-preview.spec.ts
```

(The preview-filename spec is dropped because Task 6 covers preview rendering exhaustively, and the existing one only asserts the filename appears in the `file-upload-preview` tile — which Task 6 step assertions also cover incidentally on multi-file paths.)

- [ ] **Step 3: Update import paths and switch to the `files` selector shard.**

In `e2e/specs/files/file-picker-upload.spec.ts` and `in-post-rendering.spec.ts`, update relative paths (`../../fixtures/...` is unchanged because the depth is the same — `specs/posts/X` and `specs/files/X` both have the same parent depth) and replace `posts.fileUploadInput`/`posts.fileUploadPreview` references with `files.fileUploadInput`/`files.fileUploadPreview` from `../../fixtures/selectors/files.js`.

Final `e2e/specs/files/file-picker-upload.spec.ts`:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');

test('file-picker upload: a selected file appears in the staged-file preview', async ({
  actor,
}, testInfo) => {
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`file-picker-${testInfo.parallelIndex}`);
  await files.fileUploadInput(actor).setInputFiles(SAMPLE);
  await expect(files.fileUploadPreview(actor)).toContainText('sample.ts');
});
```

Final `e2e/specs/files/in-post-rendering.spec.ts`:

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');

test('in-post rendering: uploaded file appears on PostViewPage post-file-list', async ({
  actor,
}, testInfo) => {
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`in-post-${stamp}`);
  await posts.newPostBody(actor).fill('console.log("body");');
  await files.fileUploadInput(actor).setInputFiles(SAMPLE);
  await posts.newPostSaveDraft(actor).click();

  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(files.postFileList(actor)).toContainText('sample.ts');
});
```

- [ ] **Step 4: Run only the migrated specs:**

```bash
npm run e2e -- specs/files
```

Expected: 2 passed.

- [ ] **Step 5: Run the wider posts/ folder to confirm no regression from the move:**

```bash
npm run e2e -- specs/posts
```

Expected: pass (the deleted `multi-file-*` specs are gone; remaining posts specs untouched).

- [ ] **Step 6: Commit.**

```bash
git add e2e/specs/files/ e2e/specs/posts/
git commit -m "test(e2e): #51 migrate multi-file specs from posts/ to files/"
```

---

## Task 6: Drag-drop upload spec

**Files:**

- Create: `e2e/specs/files/drag-drop-upload.spec.ts`

> Playwright cannot drive a real OS-level drag. The standard pattern is to dispatch a synthetic `drop` event on the drop zone with a JS-side `DataTransfer` populated from a file buffer.

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');

test('drag-drop upload: dropping a file on the drop zone stages it', async ({
  actor,
}, testInfo) => {
  // The drop zone is on the editor view, which only reaches it after a post
  // exists. Create a post first via UI so postId is set.
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`drag-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  // SPA-navigate to /edit via the `<router-link :to="{ name: 'post-edit' }">`
  // (verified at packages/client/src/pages/PostViewPage.vue:194). Hard reload
  // is irrelevant for THIS spec because the drop populates filesStore live —
  // but using the SPA link keeps the spec consistent with the rest of the
  // suite and avoids any state-loss surprise.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // Build an in-page DataTransfer from the fixture buffer.
  const buffer = readFileSync(SAMPLE);
  const filename = `drag-${stamp}.ts`;
  const dt = await actor.evaluateHandle(
    ({ data, name, type }) => {
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(new File([new Uint8Array(data)], name, { type }));
      return dataTransfer;
    },
    { data: Array.from(buffer), name: filename, type: 'text/plain' },
  );

  await files.editorDropZone(actor).dispatchEvent('drop', { dataTransfer: dt });

  // Drop adds it to the staged-file sidebar (filesStore.stagedFiles).
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();
});
```

- [ ] **Step 2: Run.**

```bash
npm run e2e -- specs/files/drag-drop-upload.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/drag-drop-upload.spec.ts
git commit -m "test(e2e): #51 drag-drop upload spec"
```

---

## Task 7: Multi-file post spec (3 files, sequential uploads)

**Files:**

- Create: `e2e/specs/files/multi-file-post.spec.ts`

- [ ] **Step 1: Write the spec.** Sequential uploads to avoid the parallel-upload sortOrder race documented in `pattern-queue-parallel-uploads`.

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = (n: string) => join(__dirname, '..', '..', 'fixtures', 'files', n);

test('multi-file post: 3 files attached to one post all appear, in upload order', async ({
  actor,
}, testInfo) => {
  const slug = testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase();
  const stamp = `${slug}-${Date.now()}`;

  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`multi-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  // Stage three files locally (pre-create) — order is preserved through:
  //   localStagedFiles.push (Array order)
  //   → flushLocal sequential filesStore.uploadFile calls
  //   → server-side getNextSortOrder assigns monotonically increasing sortOrder
  //   → PostViewPage renders revisionFiles by sortOrder ascending
  // Order IS user-meaningful (file picker semantics, code-runner uses
  // activeFilename). We assert order, not just presence.
  await files
    .fileUploadInput(actor)
    .setInputFiles([FIX('sample.json'), FIX('sample.yaml'), FIX('sample.md')]);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // All three filenames present.
  await expect(files.postFileList(actor)).toContainText('sample.json');
  await expect(files.postFileList(actor)).toContainText('sample.yaml');
  await expect(files.postFileList(actor)).toContainText('sample.md');

  // Order assertion — the rendered <li> sequence must match upload order.
  const items = await files.postFileList(actor).locator('li').allTextContents();
  expect(items).toEqual(['sample.json', 'sample.yaml', 'sample.md']);
});
```

- [ ] **Step 2: Run.**

```bash
npm run e2e -- specs/files/multi-file-post.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/multi-file-post.spec.ts
git commit -m "test(e2e): #51 multi-file post spec"
```

---

## Task 8: Preview rendering specs (5 specs — json, yaml, md, code, image)

**Files:**

- Create: `e2e/specs/files/preview-json.spec.ts`
- Create: `e2e/specs/files/preview-yaml.spec.ts`
- Create: `e2e/specs/files/preview-markdown.spec.ts`
- Create: `e2e/specs/files/preview-code.spec.ts`
- Create: `e2e/specs/files/preview-image.spec.ts`

> All five share the same shape: create a post with one file, navigate to where `<FilePreview>` is mounted (HomePage post-detail panel), assert the corresponding `data-testid` and content marker. Each spec MUST use a unique filename per `testInfo.title`.

- [ ] **Step 1: Write `preview-json.spec.ts`.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.json');

test('preview json: highlighted code variant renders the marker key', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`json-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await files.fileUploadInput(actor).setInputFiles(FIX);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // Navigate to HomePage where PostDetail mounts FilePreview inline.
  await actor.goto('/');
  // Click the post tile — pattern from existing posts/home-postdetail-panel-renders spec.
  await actor.getByRole('heading', { name: `json-${stamp}` }).click();
  await expect(files.filePreviewCode(actor)).toContainText('e2e-json-fixture');
});
```

- [ ] **Step 2: Run it. Expect PASS.**

- [ ] **Step 3: Write the other four specs.** They differ only in fixture file, post-title prefix, and assertion target:

| Spec file                  | Fixture                                  | Selector              | Marker                    |
| -------------------------- | ---------------------------------------- | --------------------- | ------------------------- |
| `preview-yaml.spec.ts`     | `sample.yaml`                            | `filePreviewCode`     | `e2e-yaml-fixture`        |
| `preview-markdown.spec.ts` | `sample.md`                              | `filePreviewMarkdown` | `e2e-md-fixture`          |
| `preview-code.spec.ts`     | `sample.ts` (via buffer-form, see below) | `filePreviewCode`     | `e2e-ts-fixture`          |
| `preview-image.spec.ts`    | `sample.png`                             | `filePreviewImage`    | image attribute assertion |

**`preview-code.spec.ts` MUST use buffer-form upload** to override Playwright's `.ts` → `video/mp2t` MIME inference (see Pre-implementation gotcha). Use:

```ts
import { readFileSync } from 'node:fs';
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.ts');
// ... in the test body, replace `setInputFiles(FIX)` with:
await files.fileUploadInput(actor).setInputFiles({
  name: 'sample.ts',
  mimeType: 'text/x-typescript',
  buffer: readFileSync(FIX),
});
```

The `text/x-typescript` MIME matches the server's `text/x-` allowlist prefix at `packages/shared/src/validators/file.ts:21`. The other four specs (yaml/markdown/json/image) can use path-form `setInputFiles(FIX)` because their inferred MIMEs (`application/yaml`, `text/markdown`, `application/json`, `image/png`) are in the allowlist.

For `preview-image.spec.ts` the assertion is on the `<img>` and proves the bytes actually decoded (not just the element rendered):

```ts
const img = files.filePreviewImage(actor).locator('img');
await expect(img).toBeVisible();
await expect(img).toHaveAttribute('alt', /sample\.png/);
// Prove the PNG bytes decoded: a broken image has naturalWidth === 0.
await expect
  .poll(async () => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0))
  .toBe(true);
```

- [ ] **Step 4: Run all five.**

```bash
npm run e2e -- specs/files/preview-
```

Expected: 5 passed.

- [ ] **Step 5: Commit.**

```bash
git add e2e/specs/files/preview-*.spec.ts
git commit -m "test(e2e): #51 preview rendering specs (json/yaml/md/code/image)"
```

---

## Task 9: Replace spec (delete + re-upload with same name)

**Files:**

- Create: `e2e/specs/files/replace.spec.ts`

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = (n: string) => join(__dirname, '..', '..', 'fixtures', 'files', n);

test('replace: deleting then re-uploading a file with the same name serves the new bytes', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const filename = `replace-${stamp}.json`;

  // Bootstrap an access token via the actor's refresh cookie — this is the
  // same pattern used in e2e/specs/comments/empty-state.spec.ts and
  // e2e/specs/posts/edit-cancel-reverts.spec.ts (see grep output for
  // `accessToken` in e2e/specs/). filesStore.uploadFile uses Bearer auth, so
  // direct API GETs need this header.
  const refresh = await actor.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Save an EMPTY draft (no files staged). This avoids the
  //    PostEditPage-doesn't-hydrate-stagedFiles-on-mount trap: when we
  //    upload our seed file via the editor input AFTER landing on /edit,
  //    the upload populates filesStore.stagedFiles live and the sidebar
  //    renders. SPA navigation (router-link) preserves Pinia state across
  //    /posts/new → /posts/:id → /posts/:id/edit.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`replace-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  const postId = actor.url().match(/\/posts\/([a-f0-9-]+)/)?.[1] ?? '';

  // 2. SPA-navigate to /edit via the Edit link.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(new RegExp(`/posts/${postId}/edit$`));

  // 3. Upload v1 — capture the response so we know its file id.
  const v1ResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from('{"marker":"e2e-original"}'),
  });
  const v1Body = (await (await v1ResponsePromise).json()) as { file: { id: string } };
  const v1Id = v1Body.file.id;
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 4. Remove → confirm gone from sidebar AND the file id 404s server-side
  //    (proves the DELETE persisted, not just a local UI mutation).
  await files.fileRemoveBtn(actor, filename).click();
  await expect(files.fileSidebarItem(actor, filename)).toHaveCount(0);
  const v1Check = await actor.request.get(`/api/posts/${postId}/files/${v1Id}`, { headers: auth });
  expect(v1Check.status()).toBe(404);

  // 5. Re-upload v2 with the SAME filename but different bytes; capture id.
  const v2ResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'application/json',
    buffer: Buffer.from('{"marker":"e2e-replaced"}'),
  });
  const v2Body = (await (await v2ResponsePromise).json()) as { file: { id: string } };
  const v2Id = v2Body.file.id;
  expect(v2Id).not.toBe(v1Id); // distinct row
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 6. Verify the served bytes are v2's content (proves "replace", not just
  //    "filename present").
  const v2Get = await actor.request.get(`/api/posts/${postId}/files/${v2Id}`, { headers: auth });
  expect(v2Get.status()).toBe(200);
  const v2Text = await v2Get.text();
  expect(v2Text).toContain('e2e-replaced');
  expect(v2Text).not.toContain('e2e-original');
});
```

- [ ] **Step 2: Run. Expect PASS.**

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/replace.spec.ts
git commit -m "test(e2e): #51 replace spec"
```

---

## Task 10: Remove spec (delete file from post via FileSidebar)

**Files:**

- Create: `e2e/specs/files/remove.spec.ts`

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.md');

test('remove: clicking the remove button deletes the staged file server-side', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  const filename = `remove-${stamp}.md`;

  // Bootstrap an access token for direct API verification (same pattern as
  // Task 9 — see e2e/specs/comments/empty-state.spec.ts).
  const refresh = await actor.request.post('/api/auth/refresh');
  const { accessToken } = (await refresh.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  // 1. Save an EMPTY draft so we land on a post with no staged files.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`remove-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  const postId = actor.url().match(/\/posts\/([a-f0-9-]+)/)?.[1] ?? '';

  // 2. SPA-navigate to /edit.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(new RegExp(`/posts/${postId}/edit$`));

  // 3. Upload the seed file via the editor input (populates filesStore live;
  //    sidebar appears). Capture the response to know the file id.
  const uploadResponsePromise = actor.waitForResponse(
    (r) => r.url().includes(`/api/posts/${postId}/files`) && r.request().method() === 'POST',
  );
  await files.fileUploadInput(actor).setInputFiles({
    name: filename,
    mimeType: 'text/markdown',
    buffer: require('node:fs').readFileSync(FIX),
  });
  const uploadBody = (await (await uploadResponsePromise).json()) as { file: { id: string } };
  const fileId = uploadBody.file.id;
  await expect(files.fileSidebarItem(actor, filename)).toBeVisible();

  // 4. Click remove → UI confirms removal.
  await files.fileRemoveBtn(actor, filename).click();
  await expect(files.fileSidebarItem(actor, filename)).toHaveCount(0);

  // 5. Verify the DELETE actually persisted server-side. The store-level UI
  //    removal is a Pinia mutation that runs only on a 2xx response, but a
  //    direct API check eliminates any doubt and rules out a race where the
  //    UI updates optimistically.
  const get = await actor.request.get(`/api/posts/${postId}/files/${fileId}`, { headers: auth });
  expect(get.status()).toBe(404);

  // 6. The staged-files listing for this post is now empty (no revisionId
  //    query param hits the staged branch — packages/server/src/routes/files.ts:144).
  const list = await actor.request.get(`/api/posts/${postId}/files`, { headers: auth });
  expect(list.status()).toBe(200);
  const listBody = (await list.json()) as { files: { id: string }[] };
  expect(listBody.files.find((f) => f.id === fileId)).toBeUndefined();
});
```

- [ ] **Step 2: Run. Expect PASS.**

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/remove.spec.ts
git commit -m "test(e2e): #51 remove spec"
```

---

## Task 11: Oversize-rejection spec

**Files:**

- Create: `e2e/specs/files/oversize-reject.spec.ts`

> Exercises the **client-side** 10MB check in `FileUpload.vue:48-51`. The buffer is built in-memory; nothing larger than 100KB is committed to the repo.

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

test('oversize: a file > 10 MB is rejected client-side with a friendly error', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;

  // 1. Save EMPTY draft (no files) → /posts/:id.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`oversize-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // 2. SPA-navigate to /edit.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // 3. Stage a tiny file via the EDITOR input so filesStore.stagedFiles
  //    populates and the FileSidebar renders. The FileUpload component is
  //    only mounted as part of the editable FileSidebar slot.
  await files.fileUploadInput(actor).setInputFiles({
    name: `seed-${stamp}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('seed'),
  });
  await expect(files.fileSidebarItem(actor, `seed-${stamp}.txt`)).toBeVisible();

  // 4. Now drop the oversize buffer through the FileUpload component's input
  //    (data-testid="file-upload-input-sidebar", added in Task 3 step 5).
  //    THIS handler enforces MAX_FILE_SIZE client-side at FileUpload.vue:48.
  const oversizeBuffer = Buffer.alloc(11 * 1024 * 1024, 0x61); // 11 MB of 'a'
  await files.fileUploadInputSidebar(actor).setInputFiles({
    name: `huge-${stamp}.txt`,
    mimeType: 'text/plain',
    buffer: oversizeBuffer,
  });

  // 5. The friendly client-side error renders with the canonical text from
  //    FileUpload.vue:49 — `File "${file.name}" exceeds 10MB limit`.
  await expect(files.fileUploadClientError(actor)).toContainText(/exceeds 10\s?MB/i);
});
```

- [ ] **Step 2: Run. Expect PASS.**

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/oversize-reject.spec.ts
git commit -m "test(e2e): #51 oversize rejection spec"
```

---

## Task 12: Mime-rejection spec (magic-byte mismatch — real-world malicious upload pattern)

**Files:**

- Create: `e2e/specs/files/mime-reject-magic-bytes.spec.ts`

> The DoD adversarial checklist mandates: _"Mime-rejection test uses a file whose magic bytes don't match the extension (real-world malicious upload pattern)."_ The server has two 415 paths (`packages/server/src/routes/files.ts:50-56` for the allowlist, and `:71-79` for the magic-byte check on `image/*` uploads). The DoD-required path is the magic-byte one. We claim `image/png` mime with a non-PNG body; `fileTypeFromBuffer` rejects with the distinct message _"File content does not match declared MIME type"_ → 415 → store rejects with `Upload failed: 415` → PostEditor's `fileUploadError` renders the friendly _"Unsupported file type..."_ message.

- [ ] **Step 1: Write the spec.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';

test('mime: a file whose magic bytes do not match its declared mime is rejected with a friendly error', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;

  // 1. Save EMPTY draft → /posts/:id.
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`mime-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // 2. SPA-navigate to /edit so PostEditor is mounted with postId.
  await actor.getByRole('link', { name: /edit/i }).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+\/edit$/);

  // 3. Drive the editor input (data-testid="file-upload-input"). Claim
  //    image/png mime but supply non-PNG bytes — the malicious-upload
  //    pattern from the DoD checklist. The server's fileTypeFromBuffer
  //    check (packages/server/src/routes/files.ts:71-79) detects the
  //    mismatch and returns 415 with "File content does not match
  //    declared MIME type". The store rejects, PostEditor's catch
  //    surfaces fileUploadError via friendlyUploadError(/415/).
  await files.fileUploadInput(actor).setInputFiles({
    name: `evil-${stamp}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from('this is not a real png — magic bytes are wrong'),
  });

  await expect(files.fileUploadError(actor)).toContainText(/unsupported file type/i);
});
```

- [ ] **Step 2: Run. Expect PASS.**

- [ ] **Step 3: Commit.**

```bash
git add e2e/specs/files/mime-reject-magic-bytes.spec.ts
git commit -m "test(e2e): #51 mime rejection (magic-byte mismatch) spec"
```

---

## Task 12.5: Download spec — `test.fixme()` tombstone

**Files:**

- Create: `e2e/specs/files/download.spec.ts`

> The DoD lists `download` as a distinct scenario, but the codebase has no download-as-attachment UI (verified — zero matches for download UI patterns in `packages/client/src/`; PostViewPage's `post-file-list` renders only filename `<li>`s). Per `pattern-dod-missing-feature-fixme` (`.beads/knowledge/patterns.jsonl`), the canonical response is: write the spec asserting the desired behavior, run it red for the right reason, convert to `test.fixme()` with a citation comment, and file a follow-up issue. The follow-up issue is filed in Task 13 step 8; its number is hardcoded into the spec at that point.

- [ ] **Step 1: Write the spec — initially active so we confirm it fails for the right reason.**

```ts
import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';
import { files } from '../../fixtures/selectors/files.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIX = join(__dirname, '..', '..', 'fixtures', 'files', 'sample.json');

test('download: a user-visible download affordance triggers a file download', async ({
  actor,
}, testInfo) => {
  const stamp = `${testInfo.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${Date.now()}`;
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill(`download-${stamp}`);
  await posts.newPostBody(actor).fill('seed');
  await files.fileUploadInput(actor).setInputFiles(FIX);
  await posts.newPostSaveDraft(actor).click();
  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);

  // EXPECTED behavior (not yet implemented — see follow-up issue cited
  // in the test.fixme() comment below): a "Download" affordance appears
  // next to each file in post-file-list. Clicking triggers a real download.
  const [download] = await Promise.all([
    actor.waitForEvent('download'),
    actor.getByTestId('post-file-download-link').first().click(),
  ]);
  expect(download.suggestedFilename()).toContain('sample.json');
});
```

- [ ] **Step 2: Run. Expect FAIL** with "no element matches selector `post-file-download-link`" (or similar). This confirms the missing-feature gap.

- [ ] **Step 3: Convert the active test to `test.fixme()` with a citation comment.**

Replace `test('download: ...'` with:

```ts
// Tombstone for the missing download-as-attachment user flow. The DoD for
// #51 lists "download" as a distinct scenario, but no UI affordance exists
// in the codebase as of issue #51 implementation. See follow-up issue
// #<FILED_IN_TASK_13_STEP_8> for the implementation tracking.
test.fixme('download: a user-visible download affordance triggers a file download', async ({ actor }, testInfo) => {
```

The follow-up issue number is filled in during Task 13 step 8 and committed back to this spec in the same commit that files the issue.

- [ ] **Step 4: Re-run.** Expect SKIPPED (fixme'd tests are skipped, not failed). The folder count is now 14 spec files (13 active + 1 fixme), which is documented in the Reconciliation note above.

- [ ] **Step 5: Commit.**

```bash
git add e2e/specs/files/download.spec.ts
git commit -m "test(e2e): #51 download spec as fixme tombstone (no UI yet)"
```

---

## Task 13: Verification + branch finishing

**Files:**

- Modify: `.beads/plans/active-plan.md` (mark `status: completed`)
- Modify: `.beads/context/project-context.md` (append #51 summary)
- Modify: tracking issue #43 spec count cell (file row, actual)

- [ ] **Step 1: Run the full files folder at workers=1.**

```bash
npm run e2e -- specs/files --workers=1
```

Expected: 13 passed.

- [ ] **Step 2: Run the full files folder at workers=4.**

```bash
npm run e2e -- specs/files --workers=4
```

Expected: 13 passed.

- [ ] **Step 3: Run the full E2E suite (regressions in posts/, etc.).**

```bash
npm run e2e
```

Expected: all green.

- [ ] **Step 4: Run unit + coverage gate.**

```bash
npm run test:coverage
```

Expected: lines/branches/functions/statements all ≥ 100% per `.coverage-thresholds.json`.

- [ ] **Step 5: Run Bruno collection (no API changes — sanity check only).**

```bash
cd bruno && npx @usebruno/cli run -r --env local
```

Expected: all green.

- [ ] **Step 6: Run lint + typecheck:**

```bash
npm run lint
npm run typecheck
```

Expected: zero errors. Confirm the lint guard at `.github/workflows/e2e-playwright.yml:79` does not fire (no `testuser` references in `e2e/specs/files/`).

- [ ] **Step 7: Run `/self-reflect`** to extract learnings into `.beads/knowledge/` from the implementation. Commit the resulting knowledge updates so they ship in the same PR as the code that produced them.

```bash
# From the conversation, run the slash command:
/self-reflect
```

Then:

```bash
git add .beads/knowledge/
git commit -m "chore(beads): #51 capture learnings from files E2E rollout"
```

- [ ] **Step 8: File the follow-up issues discovered during Task 5–8 implementation; backfill the download issue number into `download.spec.ts`.**

Three follow-up issues to file (in addition to the primary download UI issue):

(a) **Download UI missing** (DoD bullet folded into preview specs as fixme tombstone) — see body below.

(b) **PostEditPage HOST=localhost local-dev gap** — Playwright `webServer` command in `e2e/playwright.config.ts:34` doesn't pass `HOST=localhost`, so the test-routes registration bails (loopback-only check at `routes/__test__.ts:45`), causing `/api/__test__/reset` to 404. CI works because `.github/workflows/e2e-playwright.yml` sets `HOST=localhost` explicitly. File a follow-up to either patch the playwright config or document local-dev startup requirements.

(c) **`activeFileId` staleness across post changes** — `filesStore.fetchFiles` guards `activeFileId` with `if (!activeFileId.value)`. Once set on first post detail load, it doesn't refresh when the user clicks a different post tile. Task 8 specs work around it by explicitly clicking the sidebar item. Real UX bug worth filing.

(d) **Inline-storage UTF-8 encoding bug for small binary files** — `routeStorage` inlines files ≤64KB into `post_files.content` via `buffer.toString('utf-8')` (`packages/server/src/routes/files.ts:93`), which fails for binary content (Postgres rejects `0x00` etc with "invalid byte sequence"). Task 8 preview-image worked around with a >64KB synthetic PNG. Server fix: route binary MIME types to object storage regardless of size, or store as bytea. Out of scope for #51.

```bash
gh issue create \
  --title "[E2E follow-up] file download UI affordance" \
  --label "e2e-rollout" \
  --body "$(cat <<'EOF'
## Context

Spawned from #51 (E2E files + multi-file posts). The DoD listed "download"
as a distinct scenario, but no download-as-attachment UI exists in the
codebase: `PostViewPage.vue:215-227` renders `post-file-list` as plain
filename `<li>` elements with no anchor or download button.

The download spec lives as a `test.fixme()` tombstone at
`e2e/specs/files/download.spec.ts`. When this issue lands, the fixme is
flipped to an active test.

## Definition of Done

- A user-visible download affordance on `post-file-list` items
  (e.g., a `<a download data-testid="post-file-download-link">` per file).
- The link's `Content-Disposition` (or the click flow) produces a real
  file download in the browser, with the original filename.
- `e2e/specs/files/download.spec.ts` flipped from `test.fixme` to `test`
  and passes at workers=4.

## Out of scope

- Changes to file-content rendering (preview specs already cover that).
- Server changes — unless the existing GET endpoint needs a Content-Disposition
  toggle to support attachment-mode.
EOF
)"

# Capture the new issue number from the gh output. Then sed/edit
# download.spec.ts to replace `<FILED_IN_TASK_13_STEP_8>` with the number.
# Commit:
git add e2e/specs/files/download.spec.ts
git commit -m "test(e2e): #51 backfill follow-up issue number in download fixme"
```

- [ ] **Step 9: Update tracking issue #43.**

Update the `files/` row of the spec-count table to `13 active + 1 fixme = 14 files` (actual). Comment with PR link.

```bash
# After PR is opened — see Step 11
gh issue comment 43 --body "Files folder shipped: 13 active + 1 fixme'd download spec (see follow-up issue) at workers=4. PR #<num>."
```

- [ ] **Step 10: Mark active plan completed (local-only, no commit).**

Edit `.beads/plans/active-plan.md` frontmatter: `status: completed`. Do NOT commit — this file is gitignored (`.gitignore:24`); the local on-disk state is sufficient for context recovery per CLAUDE.md.

- [ ] **Step 11: Open PR.**

```bash
git push -u origin feat/e2e-files
gh pr create --title "feat(e2e): #51 E2E files + multi-file posts" --body "$(cat <<'EOF'
## Summary
- 13 specs under e2e/specs/files/ covering drag-drop / file-picker upload, multi-file posts, preview rendering for json/yaml/md/code/image, replace, remove, oversize rejection, mime rejection, in-post rendering
- Added file remove button (FileSidebar editable mode) and server-error UI (PostEditor)
- Added data-testid hooks on FilePreview output variants and FileUpload error span
- Migrated 3 prior placeholder specs from posts/ to files/

Closes #51. Tracking: #43.

## Test plan
- [ ] specs/files green at workers=1
- [ ] specs/files green at workers=4
- [ ] full E2E suite green
- [ ] Vitest coverage ≥ 100% (lines/branches/functions/statements)
- [ ] Bruno collection green (sanity — no API changes)
- [ ] Lint guard (e2e-playwright.yml) does not fire
- [ ] Three consecutive green runs of e2e-playwright.yml on this PR

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 12: Watch CI for 3 consecutive green runs of `e2e-playwright.yml`** before requesting merge. If a run is red, investigate root cause — do NOT mark flaky and rerun.

---

## Self-Review (post-revision after plan-review-gate iteration 1)

**1. Spec coverage vs DoD:**

| DoD bullet                                               | Implementing task                                         | Notes                                                                                  |
| -------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| drag-drop upload                                         | Task 6                                                    | synthetic DataTransfer; SPA Edit nav                                                   |
| file-picker upload                                       | Task 5 (migrated)                                         | basic pick → preview tile                                                              |
| multi-file (3 files in one post)                         | Task 7                                                    | **asserts order**, not just presence                                                   |
| preview json                                             | Task 8                                                    | content marker `e2e-json-fixture` in highlighted code                                  |
| preview yaml                                             | Task 8                                                    | content marker `e2e-yaml-fixture` in highlighted code                                  |
| preview md                                               | Task 8                                                    | content marker `e2e-md-fixture` in markdown body                                       |
| preview code                                             | Task 8                                                    | content marker `e2e-ts-fixture` in highlighted code                                    |
| preview image                                            | Task 8                                                    | **naturalWidth > 0** assertion proves bytes decoded                                    |
| download                                                 | Task 12.5 (`test.fixme()` tombstone)                      | follow-up issue filed in Task 13 step 8                                                |
| replace                                                  | Task 9                                                    | **server-bytes verified** via API GET, not just filename presence                      |
| remove                                                   | Task 10                                                   | **404 + staged-list verification** via API, no false-positive reload                   |
| oversize rejection                                       | Task 11                                                   | drives FileUpload's input via distinct testid `file-upload-input-sidebar`              |
| mime rejection                                           | Task 12                                                   | **magic-byte mismatch path** (image/png + non-PNG bytes) per DoD adversarial checklist |
| in-post rendering                                        | Task 5 (migrated)                                         | post-file-list contains filename                                                       |
| Selectors shard                                          | Tasks 1, 3, 4                                             | grows incrementally                                                                    |
| Fixture files committed (<100KB)                         | Task 2                                                    | total ≈ 1KB; Task 2 step 7 verifies                                                    |
| Unique-per-test filenames                                | every spec uses `${testInfo.title}-${Date.now()}` pattern | enforced by template                                                                   |
| Workers=1 + workers=4 pass                               | Task 13 step 1, 2                                         | both gates explicit                                                                    |
| 3 consecutive green CI                                   | Task 13 step 12                                           | manual confirmation before merge                                                       |
| Vitest + Bruno gates                                     | Task 13 step 4, 5                                         | 100% coverage gate enforced                                                            |
| Tracking issue #43 updated                               | Task 13 step 9                                            | comment + spec-count update                                                            |
| `data-testid` on file uploader/preview/multi-file picker | Tasks 3, 4                                                | every surface gets a hook                                                              |

**2. Placeholder scan:** No "TBD", no "implement later", no "add error handling" without code. Test bodies are concrete; production-code edits show the full block with surrounding context.

**3. Type consistency:**

- `files.fileUploadInput`, `files.fileUploadPreview`, `files.editorDropZone`, `files.postFileList` exist after Task 1.
- `files.filePreviewImage`, `files.filePreviewCode`, `files.filePreviewMarkdown`, `files.filePreviewText`, `files.fileUploadClientError`, `files.fileUploadInputSidebar`, `files.fileSidebarItem` exist after Task 3.
- `files.fileRemoveBtn`, `files.fileUploadError` exist after Task 4.
- `handleFileRemove`, `fileUploadError` ref, `friendlyUploadError(err: unknown)` are introduced in Task 4 and referenced consistently.
- `FileSidebar`'s `remove` emit matches both the `defineEmits` declaration and the parent's `@remove="handleFileRemove"`.
- All three upload handlers (`handleDrop`, `handleFileUpload`, `handleLocalFileChange`) clear `fileUploadError.value = null` at entry and surface friendly errors in catch.

**4. Risks reduced from iteration 1 review:**

- ~~`.last()` brittleness~~ → resolved: distinct testid `file-upload-input-sidebar` added.
- ~~`/posts/:id/edit` hydration risk~~ → resolved: specs save EMPTY drafts and upload via the editor input AFTER landing on `/edit`, so `filesStore.stagedFiles` populates live and `<FileSidebar>` renders without depending on PostEditPage hydration.
- ~~`handleLocalFileChange` not patched~~ → resolved: Task 4 step 7 supplies the full code block.
- ~~Multi-file order not asserted~~ → resolved: Task 7 asserts the rendered `<li>` sequence equals upload order.
- ~~Replace doesn't verify served bytes~~ → resolved: Task 9 captures upload responses for both v1 and v2 file ids; uses `actor.request.get(...)` with Bearer auth (pattern from `e2e/specs/comments/empty-state.spec.ts`) to assert v1→404 and v2 returns the new content.
- ~~Remove relies on reload~~ → resolved: Task 10 uses API GET 404 + staged-list verification.
- ~~Magic-byte mismatch not exercised~~ → resolved: Task 12 sets `mimeType: 'image/png'` with non-PNG bytes, exercising the `fileTypeFromBuffer` path explicitly.
- ~~Coverage gaps in `friendlyUploadError`/`handleFileRemove`~~ → resolved: Task 4 step 6 tests all 3 friendlyUploadError branches + handleFileRemove success/error/no-postId paths + non-Error rejection branch.
- ~~Download silently dropped~~ → resolved: Task 12.5 ships a `test.fixme()` tombstone with citation; Task 13 step 8 files the follow-up issue.
- ~~Unrequested README~~ → resolved: Task 2 step 8/9 reduced to a single commit step; protective rules live in this plan's Pre-implementation gotchas.

**5. Remaining risks (called out for transparency):**

- The synthetic drop in Task 6 transfers `data` as an array of byte values via `evaluateHandle`. If Playwright/V8 caps `evaluateHandle` arg size for the fixture (sample.ts is < 100B, so very unlikely to hit a cap), switch to base64 + atob inside the eval.
- The `getByRole('link', { name: /edit/i })` Edit-link click in Tasks 6, 9, 10, 11, 12 only works if the actor is recognized as the post author and the link renders (verified at `PostViewPage.vue:194` — gated by `v-if="isAuthor"`). The `actor` fixture creates the post in the same session, so `isAuthor` is true. If a future change adds a post-detail-page-only edit affordance hidden behind a slow async, add an `await expect(actor.getByRole('link', { name: /edit/i })).toBeVisible()` guard before the click.
- The actor's access token from `/api/auth/refresh` (Tasks 9, 10) has a TTL. If a spec runs longer than the TTL, the API GET will 401. Existing specs in `e2e/specs/posts/edit-cancel-reverts.spec.ts` and `e2e/specs/comments/*.spec.ts` already use this pattern at the same scale without trouble.

---

## Execution Handoff

**Plan saved to** `docs/superpowers/plans/2026-05-07-issue-51-e2e-files.md`.

Per `CLAUDE.md`, the user picks the execution method. Three options:

1. **Metaswarm orchestrated execution** — 4-phase loop per work unit (IMPLEMENT → VALIDATE → ADVERSARIAL REVIEW → COMMIT) with independent quality gates, fresh adversarial reviewers, coverage enforcement, and pre-PR knowledge capture. More thorough; more tokens.
2. **Subagent-driven development** (`superpowers:subagent-driven-development`) — Dispatch a fresh subagent per task in this session with code review between tasks. Faster, lower token cost.
3. **Parallel session** (`superpowers:executing-plans`) — Execute in a separate session with batch checkpoints. Good for long-running work you want isolated.

Which approach?
