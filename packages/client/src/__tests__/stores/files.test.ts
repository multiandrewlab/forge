import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type { PostFile } from '@forge/shared';

/** Returns the value as it would appear after JSON round-trip (dates become strings). */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function createMockPostFile(overrides: Partial<PostFile> = {}): PostFile {
  return {
    id: 'file-1',
    postId: 'post-1',
    revisionId: 'rev-1',
    filename: 'main.ts',
    mimeType: 'text/typescript',
    fileSize: 1024,
    sortOrder: 0,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

// Mock apiFetch
const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

// Mock auth store
const mockAccessToken = vi.fn<() => string | null>(() => 'test-token');
vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    accessToken: mockAccessToken(),
  }),
}));

// Mock XMLHttpRequest
interface MockXHR {
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  upload: { addEventListener: ReturnType<typeof vi.fn> };
  addEventListener: ReturnType<typeof vi.fn>;
  status: number;
  responseText: string;
}

function createMockXHR(): MockXHR {
  return {
    open: vi.fn(),
    send: vi.fn(),
    setRequestHeader: vi.fn(),
    upload: { addEventListener: vi.fn() },
    addEventListener: vi.fn(),
    status: 201,
    responseText: '',
  };
}

/** Extract a named event handler from mockXHR.addEventListener calls. Throws if not found. */
function getXHRHandler(xhr: MockXHR, event: string): (...args: unknown[]) => void {
  const entry = xhr.addEventListener.mock.calls.find((call: unknown[]) => call[0] === event) as
    | [string, (...args: unknown[]) => void]
    | undefined;
  if (!entry) {
    throw new Error(`No handler registered for XHR event "${event}"`);
  }
  return entry[1];
}

/** Extract a named event handler from mockXHR.upload.addEventListener calls. Throws if not found. */
function getUploadHandler(xhr: MockXHR, event: string): (...args: unknown[]) => void {
  const entry = xhr.upload.addEventListener.mock.calls.find(
    (call: unknown[]) => call[0] === event,
  ) as [string, (...args: unknown[]) => void] | undefined;
  if (!entry) {
    throw new Error(`No handler registered for upload event "${event}"`);
  }
  return entry[1];
}

let mockXHR: MockXHR;

beforeEach(() => {
  mockXHR = createMockXHR();
  vi.stubGlobal(
    'XMLHttpRequest',
    vi.fn(() => mockXHR),
  );
});

// Import store after mock setup
import { useFilesStore } from '@/stores/files';

describe('useFilesStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockAccessToken.mockReturnValue('test-token');
  });

  describe('initial state', () => {
    it('should have empty filesByRevision by default', () => {
      const store = useFilesStore();
      expect(store.filesByRevision).toEqual({});
    });

    it('should have null activeFileId by default', () => {
      const store = useFilesStore();
      expect(store.activeFileId).toBeNull();
    });

    it('should have empty stagedFiles by default', () => {
      const store = useFilesStore();
      expect(store.stagedFiles).toEqual([]);
    });

    it('should have empty uploadProgress by default', () => {
      const store = useFilesStore();
      expect(store.uploadProgress).toEqual({});
    });
  });

  describe('setActiveFile', () => {
    it('should set activeFileId', () => {
      const store = useFilesStore();

      store.setActiveFile('file-1');

      expect(store.activeFileId).toBe('file-1');
    });

    it('should set activeFileId to null', () => {
      const store = useFilesStore();
      store.setActiveFile('file-1');

      store.setActiveFile(null);

      expect(store.activeFileId).toBeNull();
    });
  });

  describe('fetchFiles', () => {
    it('should fetch files and cache them in filesByRevision', async () => {
      const store = useFilesStore();
      const files = [
        createMockPostFile({ id: 'f1', revisionId: 'rev-1' }),
        createMockPostFile({ id: 'f2', revisionId: 'rev-1' }),
      ];
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files }),
      });

      await store.fetchFiles('post-1', 'rev-1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files?revisionId=rev-1');
      expect(store.filesByRevision['rev-1']).toEqual(files);
    });

    it('should set activeFileId to first file when no active file', async () => {
      const store = useFilesStore();
      const files = [createMockPostFile({ id: 'f1' }), createMockPostFile({ id: 'f2' })];
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files }),
      });

      await store.fetchFiles('post-1', 'rev-1');

      expect(store.activeFileId).toBe('f1');
    });

    it('should not overwrite activeFileId when already set', async () => {
      const store = useFilesStore();
      store.setActiveFile('existing-file');
      const files = [createMockPostFile({ id: 'f1' })];
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files }),
      });

      await store.fetchFiles('post-1', 'rev-1');

      expect(store.activeFileId).toBe('existing-file');
    });

    it('should not set activeFileId when response has no files', async () => {
      const store = useFilesStore();
      mockApiFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ files: [] }),
      });

      await store.fetchFiles('post-1', 'rev-1');

      expect(store.activeFileId).toBeNull();
    });

    it('should not cache files when response is not ok', async () => {
      const store = useFilesStore();
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 404,
      });

      await store.fetchFiles('post-1', 'rev-1');

      expect(store.filesByRevision['rev-1']).toBeUndefined();
    });
  });

  describe('uploadFile', () => {
    it('should upload file via XMLHttpRequest with FormData', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file', filename: 'test.ts' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      const result = await promise;

      expect(mockXHR.open).toHaveBeenCalledWith('POST', '/api/posts/post-1/files');
      expect(mockXHR.setRequestHeader).toHaveBeenCalledWith('Authorization', 'Bearer test-token');
      expect(mockXHR.send).toHaveBeenCalled();
      expect(result).toEqual(jsonRoundTrip(uploadedFile));
    });

    it('should add uploaded file to stagedFiles', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      expect(store.stagedFiles).toHaveLength(1);
      expect(store.stagedFiles[0]).toEqual(jsonRoundTrip(uploadedFile));
    });

    it('should set activeFileId to uploaded file when no active file', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      expect(store.activeFileId).toBe('new-file');
    });

    it('should not overwrite activeFileId when already set', async () => {
      const store = useFilesStore();
      store.setActiveFile('existing-file');
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      expect(store.activeFileId).toBe('existing-file');
    });

    it('should track upload progress', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      // Simulate progress event
      const progressHandler = getUploadHandler(mockXHR, 'progress');
      progressHandler({ lengthComputable: true, loaded: 50, total: 100 });

      expect(store.uploadProgress['test.ts']).toBe(50);

      // Complete the upload
      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      // Progress should be cleaned up after completion
      expect(store.uploadProgress['test.ts']).toBeUndefined();
    });

    it('should ignore progress events when not lengthComputable', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const progressHandler = getUploadHandler(mockXHR, 'progress');
      progressHandler({ lengthComputable: false, loaded: 0, total: 0 });

      expect(store.uploadProgress['test.ts']).toBeUndefined();

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;
    });

    it('should reject when upload returns non-201 status', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });

      mockXHR.status = 500;
      mockXHR.responseText = '';

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await expect(promise).rejects.toThrow('Upload failed: 500');
    });

    it('should clean up progress on non-201 status', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });

      mockXHR.status = 500;

      const promise = store.uploadFile('post-1', file);

      // Add progress first
      const progressHandler = getUploadHandler(mockXHR, 'progress');
      progressHandler({ lengthComputable: true, loaded: 50, total: 100 });
      expect(store.uploadProgress['test.ts']).toBe(50);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await expect(promise).rejects.toThrow();

      expect(store.uploadProgress['test.ts']).toBeUndefined();
    });

    it('should reject when XHR errors', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });

      const promise = store.uploadFile('post-1', file);

      const errorHandler = getXHRHandler(mockXHR, 'error');
      errorHandler();

      await expect(promise).rejects.toThrow('Upload failed');
    });

    it('should clean up progress on XHR error', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });

      const promise = store.uploadFile('post-1', file);

      const progressHandler = getUploadHandler(mockXHR, 'progress');
      progressHandler({ lengthComputable: true, loaded: 50, total: 100 });

      const errorHandler = getXHRHandler(mockXHR, 'error');
      errorHandler();

      await expect(promise).rejects.toThrow();

      expect(store.uploadProgress['test.ts']).toBeUndefined();
    });

    it('should not set Authorization header when no access token', async () => {
      mockAccessToken.mockReturnValue(null);
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      expect(mockXHR.setRequestHeader).not.toHaveBeenCalled();
    });

    it('should send FormData with file', async () => {
      const store = useFilesStore();
      const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
      const uploadedFile = createMockPostFile({ id: 'new-file' });

      mockXHR.status = 201;
      mockXHR.responseText = JSON.stringify({ file: uploadedFile });

      const promise = store.uploadFile('post-1', file);

      const loadHandler = getXHRHandler(mockXHR, 'load');
      loadHandler();

      await promise;

      const sentFormData = mockXHR.send.mock.calls[0][0] as FormData;
      expect(sentFormData).toBeInstanceOf(FormData);
      expect(sentFormData.get('file')).toEqual(file);
    });
  });

  describe('deleteStagedFile', () => {
    it('should call DELETE and remove file from stagedFiles', async () => {
      const store = useFilesStore();
      const file1 = createMockPostFile({ id: 'f1' });
      const file2 = createMockPostFile({ id: 'f2' });
      store.stagedFiles.push(file1, file2);
      mockApiFetch.mockResolvedValue({ ok: true });

      await store.deleteStagedFile('post-1', 'f1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files/f1', {
        method: 'DELETE',
      });
      expect(store.stagedFiles).toHaveLength(1);
      expect(store.stagedFiles[0].id).toBe('f2');
    });

    it('should clear activeFileId when deleting the active file', async () => {
      const store = useFilesStore();
      const file = createMockPostFile({ id: 'f1' });
      store.stagedFiles.push(file);
      store.setActiveFile('f1');
      mockApiFetch.mockResolvedValue({ ok: true });

      await store.deleteStagedFile('post-1', 'f1');

      expect(store.activeFileId).toBeNull();
    });

    it('should not clear activeFileId when deleting a different file', async () => {
      const store = useFilesStore();
      store.stagedFiles.push(createMockPostFile({ id: 'f1' }), createMockPostFile({ id: 'f2' }));
      store.setActiveFile('f1');
      mockApiFetch.mockResolvedValue({ ok: true });

      await store.deleteStagedFile('post-1', 'f2');

      expect(store.activeFileId).toBe('f1');
    });

    it('should throw and not remove file from stagedFiles when DELETE fails', async () => {
      const store = useFilesStore();
      store.stagedFiles.push(createMockPostFile({ id: 'f1' }));
      mockApiFetch.mockResolvedValue({ ok: false, status: 500 });

      await expect(store.deleteStagedFile('post-1', 'f1')).rejects.toThrow(/Delete failed: 500/);
      expect(store.stagedFiles).toHaveLength(1);
    });
  });

  describe('clearStaged', () => {
    it('should clear stagedFiles', () => {
      const store = useFilesStore();
      store.stagedFiles.push(createMockPostFile({ id: 'f1' }));

      store.clearStaged();

      expect(store.stagedFiles).toEqual([]);
    });

    it('should clear uploadProgress', () => {
      const store = useFilesStore();
      store.uploadProgress['test.ts'] = 50;

      store.clearStaged();

      expect(store.uploadProgress).toEqual({});
    });
  });

  describe('$reset', () => {
    it('should reset all state to defaults', () => {
      const store = useFilesStore();
      store.stagedFiles.push(createMockPostFile({ id: 'f1' }));
      store.setActiveFile('f1');
      store.uploadProgress['test.ts'] = 50;
      store.filesByRevision['rev-1'] = [createMockPostFile()];

      store.$reset();

      expect(store.filesByRevision).toEqual({});
      expect(store.activeFileId).toBeNull();
      expect(store.stagedFiles).toEqual([]);
      expect(store.uploadProgress).toEqual({});
    });
  });
});
