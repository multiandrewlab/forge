import { describe, it, expect } from 'vitest';
import { ContentType, type VideoStatus } from '../../index.js';
import type {
  PostVideo,
  PostVideoSuggestion,
  VideoStatusEvent,
  VideoAiSuggestionReadyEvent,
} from '../../index.js';

describe('video types', () => {
  it('exports ContentType.Video as "video"', () => {
    expect(ContentType.Video).toBe('video');
  });

  it('VideoStatus union covers all 7 states', () => {
    const all: VideoStatus[] = [
      'uploading',
      'processing',
      'captions',
      'suggesting',
      'ready',
      'failed',
      'pending_cancel',
    ];
    expect(all).toHaveLength(7);
  });

  it('PostVideo shape compiles with all fields populated', () => {
    const v: PostVideo = {
      postId: 'p',
      cfUid: 'cf',
      pendingCfUid: null,
      status: 'ready',
      durationSec: 10,
      sizeBytes: 100,
      transcript: 't',
      playbackRequiresSignedUrl: false,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(v.cfUid).toBe('cf');
  });

  it('PostVideoSuggestion shape compiles', () => {
    const s: PostVideoSuggestion = {
      id: 'r1',
      postId: 'p1',
      title: 'A talk',
      description: 'About things',
      tags: ['typescript'],
      model: 'gpt-4',
      promptVersion: 'v1',
      createdAt: new Date(),
    };
    expect(s.title).toBe('A talk');
  });

  it('VideoStatusEvent shape compiles with optional fields', () => {
    const e: VideoStatusEvent = {
      type: 'video:status',
      postId: 'p1',
      status: 'failed',
      lastError: 'CF rejected',
      pendingCfUid: null,
    };
    expect(e.type).toBe('video:status');
  });

  it('VideoAiSuggestionReadyEvent shape compiles', () => {
    const e: VideoAiSuggestionReadyEvent = {
      type: 'video:ai-suggestion-ready',
      postId: 'p1',
      runId: 'r1',
      title: 't',
      description: 'd',
      tags: ['a'],
      createdAt: new Date().toISOString(),
    };
    expect(e.type).toBe('video:ai-suggestion-ready');
  });
});
