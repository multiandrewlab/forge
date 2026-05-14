// Per-failure-mode user-facing copy strings + CTA labels.
//
// Single source of truth for the strings shown by VideoStatusBadge / VideoEditor
// / VideoUploader / VideoPlayer when a video pipeline error surfaces to the user.
// Spec §13 enumerates 12 failure modes; 4 are server-internal (webhook signature
// invalid, webhook stale timestamp, webhook duplicate event, server crash mid
// deferred task) and are intentionally NOT represented here.
//
// CTAs are differentiated by which recovery action is appropriate:
//   - retryAi  → POST /api/posts/:id/video/ai-rerun  (transcript already exists)
//   - reUpload → DELETE current asset + open VideoUploader for a fresh file
//   - replace  → engage the visibility-flip / replacement saga
//
// Consumers branch on `ctaKey` (a literal-narrowed key into FAILURE_MODE_CTAS)
// to pick the right action verb / label / endpoint.

export const FAILURE_MODE_CTAS = {
  retryAi: { label: 'Retry AI suggestions', action: 'ai-rerun' as const },
  reUpload: { label: 'Re-upload', action: 're-upload' as const },
  replace: { label: 'Replace', action: 'replace' as const },
} as const;

export type FailureModeCtaKey = keyof typeof FAILURE_MODE_CTAS;

export interface FailureModeCopyEntry {
  headline: string;
  body: string;
  ctaKey: FailureModeCtaKey;
}

export const failureModeCopy: Record<string, FailureModeCopyEntry> = {
  upload_timed_out: {
    headline: 'Upload timed out',
    body: 'The upload took too long to start. Try re-uploading the file.',
    ctaKey: 'reUpload',
  },
  transcode_failed: {
    headline: 'Video could not be processed',
    body: 'Cloudflare could not transcode this video. Try a different file format.',
    ctaKey: 'reUpload',
  },
  captions_failed: {
    headline: 'Caption generation failed',
    body: 'Cloudflare could not generate captions for this video. Try a different file.',
    ctaKey: 'reUpload',
  },
  ai_extraction_failed: {
    headline: 'AI suggestion failed',
    body: 'The AI could not produce a title and description from the transcript. Try again.',
    ctaKey: 'retryAi',
  },
  visibility_flip_failed: {
    headline: 'Could not change visibility',
    body: 'The visibility change did not complete. Try again.',
    ctaKey: 'replace',
  },
  visibility_flip_db_failed: {
    headline: 'Visibility change is reconciling',
    body: 'Cloudflare accepted the change but the database update failed. The system is reconciling automatically — refresh in a moment.',
    ctaKey: 'replace',
  },
  cancel_in_progress: {
    headline: 'Cancel in progress',
    body: 'Cloudflare is still deleting the asset. The post will be removed shortly.',
    ctaKey: 'replace',
  },
  playback_token_refresh: {
    headline: 'Refreshing playback session',
    body: 'The playback session expired. Refreshing — this should only take a moment.',
    ctaKey: 'replace',
  },
};
