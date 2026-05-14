import { describe, it, expect } from 'vitest';
import { failureModeCopy, FAILURE_MODE_CTAS } from '../../lib/failure-mode-copy.js';

describe('failureModeCopy', () => {
  it('has entries for every user-VISIBLE failure mode from spec §13', () => {
    // Spec §13 lists 12 failure modes. 4 of them are "(invisible to user)" — no copy needed:
    // webhook signature invalid, webhook stale timestamp, webhook duplicate event id,
    // server crash mid-deferred-task. The remaining 8 are user-visible and MUST have
    // copy entries:
    const visible = [
      'upload_timed_out',
      'transcode_failed',
      'captions_failed',
      'ai_extraction_failed',
      'visibility_flip_failed',
      'visibility_flip_db_failed',
      'cancel_in_progress',
      'playback_token_refresh',
    ];
    for (const mode of visible) {
      const entry = failureModeCopy[mode];
      expect(entry).toBeDefined();
      // Narrow once for the rest of the assertions in this iteration; index types
      // include `undefined`, but the assertion above proves the entry exists.
      const present = entry as NonNullable<typeof entry>;
      expect(present.headline).toMatch(/\S/);
      expect(present.body).toMatch(/\S/);
      expect(present.ctaKey).toBeDefined();
      // ctaKey must reference an actual entry in FAILURE_MODE_CTAS
      expect(FAILURE_MODE_CTAS[present.ctaKey]).toBeDefined();
    }
  });

  it('intentionally has NO entries for invisible failure modes', () => {
    for (const mode of [
      'webhook_signature_invalid',
      'webhook_stale_timestamp',
      'webhook_duplicate_event',
      'server_crash_mid_deferred_task',
    ]) {
      expect(failureModeCopy[mode]).toBeUndefined();
    }
  });

  it('cta keys map to differentiated labels', () => {
    expect(FAILURE_MODE_CTAS.retryAi.label).toBe('Retry AI suggestions');
    expect(FAILURE_MODE_CTAS.reUpload.label).toBe('Re-upload');
    expect(FAILURE_MODE_CTAS.replace.label).toBe('Replace');
  });

  it('cta keys expose action discriminators for caller branching', () => {
    expect(FAILURE_MODE_CTAS.retryAi.action).toBe('ai-rerun');
    expect(FAILURE_MODE_CTAS.reUpload.action).toBe('re-upload');
    expect(FAILURE_MODE_CTAS.replace.action).toBe('replace');
  });

  it('ai_extraction_failed CTA is retryAi (NOT reUpload)', () => {
    const entry = failureModeCopy.ai_extraction_failed;
    expect(entry).toBeDefined();
    expect((entry as NonNullable<typeof entry>).ctaKey).toBe('retryAi');
  });

  it('upload_timed_out and transcode_failed CTAs are reUpload', () => {
    expect((failureModeCopy.upload_timed_out as { ctaKey: string }).ctaKey).toBe('reUpload');
    expect((failureModeCopy.transcode_failed as { ctaKey: string }).ctaKey).toBe('reUpload');
    expect((failureModeCopy.captions_failed as { ctaKey: string }).ctaKey).toBe('reUpload');
  });
});
