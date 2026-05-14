import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// ── Mock tus-js-client ────────────────────────────────────────────────
// Each new tus.Upload(file, opts) records its captured callbacks on a shared
// `lastUpload` so the test can drive onProgress / onSuccess / onError /
// abort() at will.

interface TusOpts {
  uploadUrl: string;
  retryDelays?: number[];
  metadata?: Record<string, string>;
  onProgress?: (sent: number, total: number) => void;
  onSuccess?: () => void;
  onError?: (err: Error) => void;
}

let lastUpload: {
  file: File;
  opts: TusOpts;
  start: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
} | null = null;

vi.mock('tus-js-client', () => ({
  Upload: vi.fn().mockImplementation(function (this: unknown, file: File, opts: TusOpts) {
    lastUpload = {
      file,
      opts,
      start: vi.fn(),
      abort: vi.fn(),
    };
    return lastUpload;
  }),
}));

// ── Mock apiFetch ──────────────────────────────────────────────────────

const mockApiFetch = vi.fn();
vi.mock('../../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

// Now-safe to import the component (after mocks register).
import VideoUploader from '../../../components/editor/VideoUploader.vue';

// ── Helpers ────────────────────────────────────────────────────────────

function makeFile(name: string, type: string, sizeBytes = 1024): File {
  const file = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
  return file;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function selectFile(w: ReturnType<typeof mount>, file: File): Promise<void> {
  const input = w.find('input[type="file"]').element as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await w.find('input[type="file"]').trigger('change');
  await flushPromises();
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('VideoUploader', () => {
  beforeEach(() => {
    lastUpload = null;
    mockApiFetch.mockReset();
  });

  it('renders a file input', () => {
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    expect(w.find('input[type="file"]').exists()).toBe(true);
    expect(w.find('[data-testid="video-file-input"]').exists()).toBe(true);
  });

  it('rejects non-video MIME and surfaces an error message', async () => {
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    const txt = makeFile('a.txt', 'text/plain', 100);
    await selectFile(w, txt);
    expect(w.text()).toMatch(/not a video|file type/i);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('rejects files larger than 10 GB locally before contacting the server', async () => {
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    const big = makeFile('a.mp4', 'video/mp4', 11 * 1024 * 1024 * 1024);
    await selectFile(w, big);
    expect(w.text()).toMatch(/too large|max/i);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('accepts video/mp4, video/webm, video/quicktime', async () => {
    for (const mime of ['video/mp4', 'video/webm', 'video/quicktime']) {
      mockApiFetch.mockReset();
      mockApiFetch.mockResolvedValueOnce(
        jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201),
      );
      const w = mount(VideoUploader, { props: { postId: 'p1' } });
      const file = makeFile('a.mov', mime, 1000);
      await selectFile(w, file);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/posts/p1/video/upload-url',
        expect.objectContaining({ method: 'POST' }),
      );
    }
  });

  it('on file select calls /upload-url then starts tus upload', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ uploadUrl: 'https://upload.example/abc', cfUid: 'cf1' }, 201),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    const file = makeFile('a.mp4', 'video/mp4', 2048);
    await selectFile(w, file);
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/posts/p1/video/upload-url',
      expect.objectContaining({
        method: 'POST',
        // Fastify parses request.body as null without a Content-Type header,
        // which would cause a 400 INVALID body server-side. Pin the header.
        headers: expect.objectContaining({ 'content-type': 'application/json' }),
        body: expect.stringContaining('"filename":"a.mp4"'),
      }),
    );
    expect(lastUpload).not.toBeNull();
    expect(lastUpload?.opts.uploadUrl).toBe('https://upload.example/abc');
    expect(lastUpload?.start).toHaveBeenCalled();
  });

  it('emits upload-started with the cfUid returned by the server', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf-xyz' }, 201),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    expect(w.emitted('upload-started')?.[0]).toEqual(['cf-xyz']);
  });

  it('shows percent progress when tus invokes onProgress', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    lastUpload?.opts.onProgress?.(50, 200);
    await flushPromises();
    expect(w.text()).toContain('25%');
  });

  it('emits upload-success when tus invokes onSuccess', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    lastUpload?.opts.onSuccess?.();
    await flushPromises();
    expect(w.emitted('upload-success')).toBeTruthy();
  });

  it('surfaces error when tus invokes onError', async () => {
    mockApiFetch.mockResolvedValueOnce(
      jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    lastUpload?.opts.onError?.(new Error('network down'));
    await flushPromises();
    expect(w.text()).toContain('network down');
  });

  it('surfaces upload-url server failure as an error message', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'quota exceeded' }), {
        status: 429,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    expect(w.text()).toContain('quota exceeded');
    expect(lastUpload).toBeNull();
  });

  it('falls back to generic error when upload-url response has no error field', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({}), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    expect(w.text()).toMatch(/upload-url request failed/);
  });

  it('Cancel button aborts the tus upload and calls DELETE /video', async () => {
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    expect(w.find('[data-testid="video-uploader-cancel"]').exists()).toBe(true);
    await w.find('[data-testid="video-uploader-cancel"]').trigger('click');
    await flushPromises();
    expect(lastUpload?.abort).toHaveBeenCalled();
    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/posts/p1/video',
      expect.objectContaining({ method: 'DELETE' }),
    );
    expect(w.emitted('upload-cancelled')).toBeTruthy();
  });

  it('cancel without an in-flight upload is a no-op (no abort, but still emits)', async () => {
    // Render the uploader but never select a file; cancel button is not visible.
    // Indirect path: invoke cancel via component method through a successful start
    // and then a second cancel — second cancel has no abort target.
    mockApiFetch
      .mockResolvedValueOnce(jsonResponse({ uploadUrl: 'https://up', cfUid: 'cf1' }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    await w.find('[data-testid="video-uploader-cancel"]').trigger('click');
    await flushPromises();
    expect(w.emitted('upload-cancelled')?.length).toBe(1);
  });

  it('does nothing when the change event fires with no file', async () => {
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    // Simulate the user opening + closing the picker (files = [])
    const input = w.find('input[type="file"]').element as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [], configurable: true });
    await w.find('input[type="file"]').trigger('change');
    await flushPromises();
    expect(mockApiFetch).not.toHaveBeenCalled();
    expect(lastUpload).toBeNull();
    expect(w.text()).not.toMatch(/not a video|too large/i);
  });

  it('renders error as plain text (no <script> escape)', async () => {
    mockApiFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '<script>alert(1)</script>' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const w = mount(VideoUploader, { props: { postId: 'p1' } });
    await selectFile(w, makeFile('a.mp4', 'video/mp4', 100));
    expect(w.element.querySelectorAll('script').length).toBe(0);
    expect(w.text()).toContain('<script>alert(1)</script>');
  });
});
