// Video-post domain types for Cloudflare Stream integration (issue #102).
//
// These mirror the post_videos / post_video_ai_runs tables (migration 005) and
// the WebSocket frames the server pushes when CF Stream advances an asset
// through processing, captions, suggestions, and ready.

export type VideoStatus =
  | 'uploading'
  | 'processing'
  | 'captions'
  | 'suggesting'
  | 'ready'
  | 'failed'
  | 'pending_cancel';

export interface PostVideo {
  postId: string;
  cfUid: string;
  pendingCfUid: string | null;
  status: VideoStatus;
  durationSec: number | null;
  sizeBytes: number | null;
  transcript: string | null;
  playbackRequiresSignedUrl: boolean;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PostVideoSuggestion {
  id: string;
  postId: string;
  title: string;
  description: string;
  tags: string[];
  model: string;
  promptVersion: string;
  createdAt: Date;
}

export interface VideoStatusEvent {
  type: 'video:status';
  postId: string;
  status: VideoStatus;
  lastError?: string;
  pendingCfUid?: string | null;
}

export interface VideoAiSuggestionReadyEvent {
  type: 'video:ai-suggestion-ready';
  postId: string;
  runId: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string; // ISO 8601
}
