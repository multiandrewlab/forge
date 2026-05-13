import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  insertPostVideo,
  getPostVideo,
  setPostVideoStatus,
  setPendingCfUid,
  swapPostVideoCfUid,
  setPostVideoTranscript,
  selectReconcilerCandidates,
  insertAiRun,
  deletePostVideo,
  tryAdvisoryXactLock,
  insertWebhookEvent,
  findPostVideoByCfUid,
  setPlaybackRequiresSignedUrl,
  setPostVideoLastError,
  getLatestAiRunForPost,
} from '../../../db/queries/video.js';

const mockQuery = query as Mock;

const postId = '550e8400-e29b-41d4-a716-446655440000';

const sampleVideoRow = {
  post_id: postId,
  cf_uid: 'cf-abc',
  pending_cf_uid: null,
  status: 'uploading',
  duration_sec: null,
  size_bytes: null,
  transcript: null,
  playback_requires_signed_url: false,
  last_error: null,
  created_at: new Date('2026-05-13T00:00:00Z'),
  updated_at: new Date('2026-05-13T00:00:00Z'),
};

describe('video queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('insertPostVideo', () => {
    it('inserts a row in uploading state', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await insertPostVideo({ postId, cfUid: 'cf-abc' });
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO post_videos'), [
        postId,
        'cf-abc',
      ]);
      // Verify the SQL pins status to 'uploading'.
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/'uploading'/);
    });
  });

  describe('getPostVideo', () => {
    it('returns the mapped PostVideo when a row exists', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVideoRow], rowCount: 1 });
      const row = await getPostVideo(postId);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM post_videos WHERE post_id = $1', [
        postId,
      ]);
      expect(row).toEqual({
        postId,
        cfUid: 'cf-abc',
        pendingCfUid: null,
        status: 'uploading',
        durationSec: null,
        sizeBytes: null,
        transcript: null,
        playbackRequiresSignedUrl: false,
        lastError: null,
        createdAt: sampleVideoRow.created_at,
        updatedAt: sampleVideoRow.updated_at,
      });
    });

    it('returns null when no row exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      expect(await getPostVideo(postId)).toBeNull();
    });

    it('maps populated columns (e.g. transcript, durationSec) correctly', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            ...sampleVideoRow,
            pending_cf_uid: 'cf-new',
            status: 'ready',
            duration_sec: 42,
            size_bytes: 1024,
            transcript: 'hello',
            playback_requires_signed_url: true,
            last_error: 'prior',
          },
        ],
        rowCount: 1,
      });
      const row = await getPostVideo(postId);
      expect(row).toMatchObject({
        pendingCfUid: 'cf-new',
        status: 'ready',
        durationSec: 42,
        sizeBytes: 1024,
        transcript: 'hello',
        playbackRequiresSignedUrl: true,
        lastError: 'prior',
      });
    });
  });

  describe('setPostVideoStatus', () => {
    it('returns true when CAS wins (rowCount 1)', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const ok = await setPostVideoStatus({
        postId,
        from: 'uploading',
        to: 'processing',
      });
      expect(ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE post_videos'), [
        postId,
        'uploading',
        'processing',
        null,
      ]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/status\s*=\s*\$3/);
      expect(sql).toMatch(/last_error\s*=\s*\$4/);
      expect(sql).toMatch(/last_status_change_at\s*=\s*NOW\(\)/);
      expect(sql).toMatch(/WHERE\s+post_id\s*=\s*\$1\s+AND\s+status\s*=\s*\$2/);
    });

    it('forwards lastError when supplied', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await setPostVideoStatus({
        postId,
        from: 'processing',
        to: 'failed',
        lastError: 'boom',
      });
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
        postId,
        'processing',
        'failed',
        'boom',
      ]);
    });

    it('returns false when CAS loses (rowCount 0)', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const ok = await setPostVideoStatus({ postId, from: 'uploading', to: 'ready' });
      expect(ok).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      const ok = await setPostVideoStatus({ postId, from: 'uploading', to: 'ready' });
      expect(ok).toBe(false);
    });
  });

  describe('setPendingCfUid', () => {
    it('updates pending_cf_uid for the post', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await setPendingCfUid({ postId, pendingCfUid: 'cf-new' });
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE post_videos'), [
        postId,
        'cf-new',
      ]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/pending_cf_uid\s*=\s*\$2/);
    });
  });

  describe('swapPostVideoCfUid', () => {
    it('atomically swaps cf_uid from pending and sets status=ready', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await swapPostVideoCfUid({ postId });
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [postId]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/cf_uid\s*=\s*pending_cf_uid/);
      expect(sql).toMatch(/pending_cf_uid\s*=\s*NULL/);
      expect(sql).toMatch(/status\s*=\s*'ready'/);
      expect(sql).toMatch(/pending_cf_uid\s+IS\s+NOT\s+NULL/);
    });
  });

  describe('setPostVideoTranscript', () => {
    it('updates the transcript column', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await setPostVideoTranscript({ postId, transcript: 'hello kibana' });
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE post_videos'), [
        postId,
        'hello kibana',
      ]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/transcript\s*=\s*\$2/);
    });
  });

  describe('selectReconcilerCandidates', () => {
    it('boot sweep (no interval): selects all non-terminal rows', async () => {
      mockQuery.mockResolvedValue({
        rows: [
          {
            post_id: postId,
            cf_uid: 'cf-1',
            pending_cf_uid: null,
            status: 'processing',
          },
        ],
        rowCount: 1,
      });
      const rows = await selectReconcilerCandidates({});
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), []);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/status\s+NOT\s+IN\s*\(\s*'ready'\s*,\s*'failed'\s*\)/);
      expect(sql).not.toMatch(/last_status_change_at/);
      expect(rows).toEqual([{ postId, cfUid: 'cf-1', pendingCfUid: null, status: 'processing' }]);
    });

    it('staleness sweep (interval): adds last_status_change_at filter and binds ms', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      await selectReconcilerCandidates({ stalenessIntervalMs: 600_000 });
      expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [600_000]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/last_status_change_at\s*<\s*NOW\(\)\s*-/);
      expect(sql).toMatch(/\$1::int/);
      expect(sql).toMatch(/milliseconds/);
    });
  });

  describe('insertAiRun', () => {
    it('inserts the AI run and returns the generated id', async () => {
      const newId = '660e8400-e29b-41d4-a716-446655440099';
      mockQuery.mockResolvedValue({ rows: [{ id: newId }], rowCount: 1 });
      const result = await insertAiRun({
        postId,
        title: 't',
        description: 'd',
        tags: ['a', 'b'],
        model: 'm',
        transcriptChars: 1234,
        wasTruncated: false,
        promptVersion: 'v1',
      });
      expect(result).toEqual({ id: newId });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO post_video_ai_runs'),
        [postId, 't', 'd', ['a', 'b'], 'm', 1234, false, 'v1'],
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/RETURNING\s+id/);
    });
  });

  describe('deletePostVideo', () => {
    it('issues a DELETE keyed on post_id', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await deletePostVideo({ postId });
      expect(mockQuery).toHaveBeenCalledWith('DELETE FROM post_videos WHERE post_id = $1', [
        postId,
      ]);
    });
  });

  describe('tryAdvisoryXactLock', () => {
    it('uses the module pool client and returns true when ok', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ok: true }], rowCount: 1 });
      const ok = await tryAdvisoryXactLock({ postId });
      expect(ok).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('pg_try_advisory_xact_lock'), [
        postId,
      ]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/hashtext\('video-ai:'\s*\|\|\s*\$1::text\)/);
    });

    it('returns false when lock is not granted', async () => {
      mockQuery.mockResolvedValue({ rows: [{ ok: false }], rowCount: 1 });
      expect(await tryAdvisoryXactLock({ postId })).toBe(false);
    });

    it('uses the provided pg client when one is passed', async () => {
      const clientQuery = vi.fn().mockResolvedValue({ rows: [{ ok: true }], rowCount: 1 });
      const fakeClient = { query: clientQuery };
      const ok = await tryAdvisoryXactLock(
        { postId },
        fakeClient as unknown as Parameters<typeof tryAdvisoryXactLock>[1],
      );
      expect(ok).toBe(true);
      expect(clientQuery).toHaveBeenCalledWith(
        expect.stringContaining('pg_try_advisory_xact_lock'),
        [postId],
      );
      // The module-level query mock MUST NOT be touched when a client is passed.
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('findPostVideoByCfUid', () => {
    it('returns the mapped { postId } when a row matches by cf_uid or pending_cf_uid', async () => {
      mockQuery.mockResolvedValue({ rows: [{ post_id: postId }], rowCount: 1 });
      const found = await findPostVideoByCfUid('cf-abc');
      expect(found).toEqual({ postId });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT post_id FROM post_videos'),
        ['cf-abc'],
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/cf_uid\s*=\s*\$1\s+OR\s+pending_cf_uid\s*=\s*\$1/);
    });

    it('returns null when no row matches', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const found = await findPostVideoByCfUid('cf-missing');
      expect(found).toBeNull();
    });
  });

  describe('setPlaybackRequiresSignedUrl', () => {
    it('updates playback_requires_signed_url for the post', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await setPlaybackRequiresSignedUrl({ postId, value: true });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringMatching(/UPDATE post_videos SET playback_requires_signed_url/i),
        [postId, true],
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/playback_requires_signed_url\s*=\s*\$2/);
      expect(sql).toMatch(/updated_at\s*=\s*NOW\(\)/);
      expect(sql).toMatch(/WHERE\s+post_id\s*=\s*\$1/);
    });
  });

  describe('setPostVideoLastError', () => {
    it('updates last_error for the post', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      await setPostVideoLastError({ postId, lastError: 'visibility-flip-drift' });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE post_videos SET last_error'),
        [postId, 'visibility-flip-drift'],
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/last_error\s*=\s*\$2/);
      expect(sql).toMatch(/updated_at\s*=\s*NOW\(\)/);
      expect(sql).toMatch(/WHERE\s+post_id\s*=\s*\$1/);
    });
  });

  describe('getLatestAiRunForPost', () => {
    it('returns the most recent run mapped to camelCase when rows exist', async () => {
      const createdAt = new Date('2026-05-13T10:00:00Z');
      mockQuery.mockResolvedValue({
        rows: [
          {
            id: 'run-1',
            title: 'Sample title',
            description: 'Sample description',
            tags: ['typescript', 'demo'],
            created_at: createdAt,
          },
        ],
        rowCount: 1,
      });
      const run = await getLatestAiRunForPost(postId);
      expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('FROM post_video_ai_runs'), [
        postId,
      ]);
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ORDER\s+BY\s+created_at\s+DESC/);
      expect(sql).toMatch(/LIMIT\s+1/);
      expect(run).toEqual({
        id: 'run-1',
        title: 'Sample title',
        description: 'Sample description',
        tags: ['typescript', 'demo'],
        createdAt,
      });
    });

    it('returns null when no run exists', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      expect(await getLatestAiRunForPost(postId)).toBeNull();
    });
  });

  describe('insertWebhookEvent', () => {
    it('returns true when the event was newly inserted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const inserted = await insertWebhookEvent({
        eventId: 'evt-1',
        cfUid: 'cf-1',
        eventType: 'video.ready',
      });
      expect(inserted).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO cf_stream_webhook_events'),
        ['evt-1', 'cf-1', 'video.ready'],
      );
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toMatch(/ON\s+CONFLICT\s*\(\s*event_id\s*\)\s+DO\s+NOTHING/);
    });

    it('returns false on duplicate (rowCount 0)', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      expect(
        await insertWebhookEvent({
          eventId: 'evt-1',
          cfUid: 'cf-1',
          eventType: 'video.ready',
        }),
      ).toBe(false);
    });

    it('returns false when rowCount is null', async () => {
      mockQuery.mockResolvedValue({ rowCount: null });
      expect(
        await insertWebhookEvent({
          eventId: 'evt-1',
          cfUid: 'cf-1',
          eventType: 'video.ready',
        }),
      ).toBe(false);
    });
  });
});
