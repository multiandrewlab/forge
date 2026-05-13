import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';

// ── Mock useVideoStatus composable ────────────────────────────────────
// VideoEditor consumes this composable for live status updates. We expose
// mutable refs so each test can drive the reactive state and observe the
// component's response inline (status/error/pendingCfUid/suggestions).

const mockStatus = ref<string | null>(null);
const mockProgress = ref<number | null>(null);
const mockSuggestions = ref<{
  runId: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
} | null>(null);
const mockError = ref<string | null>(null);
const mockPendingCfUid = ref<string | null>(null);

vi.mock('../../../composables/useVideoStatus.js', () => ({
  useVideoStatus: () => ({
    status: mockStatus,
    progress: mockProgress,
    suggestions: mockSuggestions,
    error: mockError,
    pendingCfUid: mockPendingCfUid,
  }),
}));

// ── Mock apiFetch ─────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// ── Mock VideoPlayer / VideoUploader / VideoStatusBadge ────────────────
// Stub so we can assert their presence without exercising upstream details.

vi.mock('../../../components/post/VideoPlayer.vue', () => ({
  default: {
    name: 'VideoPlayer',
    props: ['postId'],
    template: '<div data-testid="video-player-stub"></div>',
  },
}));

vi.mock('../../../components/post/VideoStatusBadge.vue', () => ({
  default: {
    name: 'VideoStatusBadge',
    props: ['status', 'progress', 'pendingCfUid', 'lastError'],
    template: '<span :data-testid="`video-status-badge-${status}`">{{ status }}</span>',
  },
}));

vi.mock('../../../components/editor/VideoUploader.vue', () => ({
  default: {
    name: 'VideoUploader',
    props: ['postId'],
    emits: ['upload-started', 'upload-success', 'upload-cancelled'],
    template: '<div data-testid="video-uploader-stub"></div>',
  },
}));

import VideoEditor from '../../../components/editor/VideoEditor.vue';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('VideoEditor', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockStatus.value = null;
    mockProgress.value = null;
    mockSuggestions.value = null;
    mockError.value = null;
    mockPendingCfUid.value = null;
    // Default — initial suggestions fetch returns 404 (no suggestions yet).
    mockApiFetch.mockResolvedValue(new Response(null, { status: 404 }));
  });

  it('renders VideoStatusBadge with the current reactive status', async () => {
    mockStatus.value = 'processing';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-status-badge-processing"]').exists()).toBe(true);
  });

  it('renders VideoPlayer when status is ready', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-player-stub"]').exists()).toBe(true);
  });

  it('does NOT render VideoPlayer when status is not ready', async () => {
    mockStatus.value = 'processing';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-player-stub"]').exists()).toBe(false);
  });

  it('fetches initial suggestions on mount', async () => {
    mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/video/suggestions');
  });

  it('hydrates the AI form from the initial suggestions GET response', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        status: 'ready',
        lastError: null,
        suggestion: {
          id: 'r1',
          title: 'Cached Title',
          description: 'Cached Description',
          tags: ['cached'],
          createdAt: '2026-05-13T00:00:00Z',
        },
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    expect(titleInput.element.value).toBe('Cached Title');
    const descInput = w.find<HTMLTextAreaElement>('[data-testid="video-editor-description"]');
    expect(descInput.element.value).toBe('Cached Description');
  });

  it('leaves the form blank when initial suggestion is null (server "no run yet")', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ status: 'ready', lastError: null, suggestion: null }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    expect(titleInput.element.value).toBe('');
  });

  it('hydrates the form when a WS suggestion arrives after mount', async () => {
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    mockSuggestions.value = {
      runId: 'r2',
      title: 'Streamed Title',
      description: 'Streamed Description',
      tags: ['streamed'],
      createdAt: '2026-05-13T00:00:00Z',
    };
    await flushPromises();
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    expect(titleInput.element.value).toBe('Streamed Title');
  });

  // ── SAFETY: AI text MUST be rendered as text only (no v-html). ────────
  // Spec §9.4 v-html safety gate. The component must never execute markup
  // present in transcript-derived AI output.
  it('renders AI title/description as TEXT ONLY (no <script> element)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        status: 'ready',
        lastError: null,
        suggestion: {
          id: 'r',
          title: '<script>alert(1)</script>x',
          description: '<script>x</script>d',
          tags: ['a'],
          createdAt: '2026-05-13T00:00:00Z',
        },
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.element.querySelectorAll('script').length).toBe(0);
    // The literal "alert(1)" must appear as text in an editable input value
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    expect(titleInput.element.value).toContain('alert(1)');
  });

  it('shows Retry-AI button when status=failed with retryAi-mapped lastError', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'ai_extraction_failed';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-editor-retry-ai-btn"]').exists()).toBe(true);
  });

  it('Retry-AI button POSTs to /api/posts/:id/video/ai-rerun', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'ai_extraction_failed';
    mockApiFetch.mockResolvedValue(new Response(null, { status: 404 }));
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await w.find('[data-testid="video-editor-retry-ai-btn"]').trigger('click');
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/video/ai-rerun', {
      method: 'POST',
    });
  });

  it('shows Re-upload button when status=failed with reUpload-mapped lastError', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'transcode_failed';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-editor-reupload-btn"]').exists()).toBe(true);
  });

  it('Re-upload button reveals inline VideoUploader when clicked', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'transcode_failed';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-reupload-btn"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
  });

  it('shows Replace button when status=ready', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-editor-replace-btn"]').exists()).toBe(true);
  });

  it('Replace button reveals inline VideoUploader when clicked', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-replace-btn"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
  });

  it('shows Cancel button when status is not ready (draft path)', async () => {
    mockStatus.value = 'processing';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-editor-cancel-btn"]').exists()).toBe(true);
  });

  it('hides Cancel button when status is ready (already published-eligible)', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-editor-cancel-btn"]').exists()).toBe(false);
  });

  it('Cancel button DELETEs to /api/posts/:id/video', async () => {
    mockStatus.value = 'processing';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    mockApiFetch.mockClear();
    mockApiFetch.mockResolvedValueOnce(jsonResponse({ ok: true }));
    await w.find('[data-testid="video-editor-cancel-btn"]').trigger('click');
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/video', {
      method: 'DELETE',
    });
  });

  it('shows VideoUploader inline when status is null (initial — no upload started)', async () => {
    mockStatus.value = null;
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
  });

  it('renders the failure body copy from failureModeCopy when failed', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'transcode_failed';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    expect(w.text()).toContain('Cloudflare could not transcode this video');
  });

  it('does not render the failure copy block for unknown lastError', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'unknown_mode_xyz';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    // No CTA buttons should render for an unmapped failure mode.
    expect(w.find('[data-testid="video-editor-retry-ai-btn"]').exists()).toBe(false);
    expect(w.find('[data-testid="video-editor-reupload-btn"]').exists()).toBe(false);
  });

  it('does NOT call apiFetch on tag edit (form is local until parent saves)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        runId: 'r',
        title: 'T',
        description: 'D',
        tags: ['existing'],
        createdAt: '2026-05-13T00:00:00Z',
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    mockApiFetch.mockClear();
    const tagInput = w.find<HTMLInputElement>('[data-testid="video-editor-tag-input"]');
    await tagInput.setValue('new');
    await tagInput.trigger('keydown.enter');
    await flushPromises();
    expect(mockApiFetch).not.toHaveBeenCalled();
    // The new tag is shown in the rendered tag list.
    expect(w.text()).toContain('new');
  });

  it('removes a tag via the remove-tag button', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        status: 'ready',
        lastError: null,
        suggestion: {
          id: 'r',
          title: 'T',
          description: 'D',
          tags: ['keep', 'drop'],
          createdAt: '2026-05-13T00:00:00Z',
        },
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-tag-remove-drop"]').trigger('click');
    await flushPromises();
    expect(w.text()).not.toContain('drop');
    expect(w.text()).toContain('keep');
  });

  it('ignores the initial suggestions GET when response status is not ok', async () => {
    // 404 is the default; assert it does not throw and the form renders with
    // empty values when the user is the author.
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    expect(titleInput.element.value).toBe('');
  });

  it('reveals VideoUploader on failure-Replace CTA (visibility_flip_failed)', async () => {
    mockStatus.value = 'failed';
    mockError.value = 'visibility_flip_failed';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-replace-btn"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
  });

  it('resets replaceMode after VideoUploader emits upload-success', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-replace-btn"]').trigger('click');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
    const uploader = w.findComponent({ name: 'VideoUploader' });
    await uploader.vm.$emit('upload-success');
    await flushPromises();
    // After upload-success the inline uploader collapses back to the badge/player.
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(false);
  });

  it('resets replaceMode after VideoUploader emits upload-cancelled', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-replace-btn"]').trigger('click');
    await flushPromises();
    const uploader = w.findComponent({ name: 'VideoUploader' });
    await uploader.vm.$emit('upload-cancelled');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(false);
  });

  it('keeps the uploader visible while VideoUploader emits upload-started', async () => {
    // upload-started is a no-op on the editor side — the badge already
    // surfaces the new pipeline state via the WS frame. We assert the uploader
    // does not get torn down prematurely so the user can still see the tus
    // progress indicator.
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    await w.find('[data-testid="video-editor-replace-btn"]').trigger('click');
    await flushPromises();
    const uploader = w.findComponent({ name: 'VideoUploader' });
    await uploader.vm.$emit('upload-started', 'cf-new-uid');
    await flushPromises();
    expect(w.find('[data-testid="video-uploader-stub"]').exists()).toBe(true);
  });

  it('ignores an empty tag input on Enter (no-op)', async () => {
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    const tagInput = w.find<HTMLInputElement>('[data-testid="video-editor-tag-input"]');
    await tagInput.setValue('   '); // only whitespace
    await tagInput.trigger('keydown.enter');
    await flushPromises();
    // No tags rendered.
    expect(w.find('[data-testid="video-editor-tag-list"]').text().trim()).toBe('');
  });

  it('ignores duplicate tag entries (no double-add)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        status: 'ready',
        lastError: null,
        suggestion: {
          id: 'r',
          title: 'T',
          description: 'D',
          tags: ['dup'],
          createdAt: '2026-05-13T00:00:00Z',
        },
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    const tagInput = w.find<HTMLInputElement>('[data-testid="video-editor-tag-input"]');
    await tagInput.setValue('dup');
    await tagInput.trigger('keydown.enter');
    await flushPromises();
    // Still exactly one "dup" pill — count remove-buttons.
    expect(w.findAll('[data-testid="video-editor-tag-remove-dup"]').length).toBe(1);
  });

  it('does NOT clobber form edits when a stale WS suggestion arrives', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({
        status: 'ready',
        lastError: null,
        suggestion: {
          id: 'r1',
          title: 'Initial',
          description: 'Initial',
          tags: [],
          createdAt: '2026-05-13T00:00:00Z',
        },
      }),
    );
    mockStatus.value = 'ready';
    const w = mount(VideoEditor, { props: { postId: 'p1', isAuthor: true } });
    await flushPromises();
    // User edits the title.
    const titleInput = w.find<HTMLInputElement>('[data-testid="video-editor-title"]');
    await titleInput.setValue('User Override');
    // A stale WS suggestion arrives — should NOT overwrite the user's edit.
    mockSuggestions.value = {
      runId: 'r1', // same runId — stale
      title: 'Initial',
      description: 'Initial',
      tags: [],
      createdAt: '2026-05-13T00:00:00Z',
    };
    await flushPromises();
    expect(titleInput.element.value).toBe('User Override');
  });
});
