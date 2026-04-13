import { describe, it, expect } from 'vitest';
import {
  aiCompleteRequestSchema,
  aiGenerateRequestSchema,
  AI_DESCRIPTION_MAX,
} from '../../validators/ai.js';

describe('aiCompleteRequestSchema', () => {
  it('accepts a well-formed request', () => {
    const r = aiCompleteRequestSchema.safeParse({
      before: 'function add(a, b) {',
      after: '}',
      language: 'javascript',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing before', () => {
    const r = aiCompleteRequestSchema.safeParse({ after: '}', language: 'javascript' });
    expect(r.success).toBe(false);
  });

  it('allows empty before/after strings', () => {
    const r = aiCompleteRequestSchema.safeParse({ before: '', after: '', language: 'markdown' });
    expect(r.success).toBe(true);
  });

  it('rejects before longer than 8000 chars', () => {
    const r = aiCompleteRequestSchema.safeParse({
      before: 'x'.repeat(8001),
      after: '',
      language: 'javascript',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid language type', () => {
    const r = aiCompleteRequestSchema.safeParse({ before: '', after: '', language: 42 });
    expect(r.success).toBe(false);
  });
});

describe('AI_DESCRIPTION_MAX', () => {
  it('equals 2000', () => {
    expect(AI_DESCRIPTION_MAX).toBe(2000);
  });
});

describe('aiGenerateRequestSchema', () => {
  it('accepts a valid snippet with language', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'A helper that formats dates',
      contentType: 'snippet',
      language: 'python',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contentType).toBe('snippet');
      expect(r.data.language).toBe('python');
    }
  });

  it('accepts a valid prompt without language', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'Write a creative prompt',
      contentType: 'prompt',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contentType).toBe('prompt');
      expect(r.data.language).toBeUndefined();
    }
  });

  it('accepts a valid document without language', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'A README for my project',
      contentType: 'document',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.contentType).toBe('document');
    }
  });

  it('rejects contentType link', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'Some link content',
      contentType: 'link',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty description', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: '',
      contentType: 'snippet',
    });
    expect(r.success).toBe(false);
  });

  it('rejects description over AI_DESCRIPTION_MAX chars', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'x'.repeat(2001),
      contentType: 'snippet',
    });
    expect(r.success).toBe(false);
  });

  it('rejects language over 32 chars', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'Something',
      contentType: 'snippet',
      language: 'a'.repeat(33),
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing contentType', () => {
    const r = aiGenerateRequestSchema.safeParse({
      description: 'Something without a type',
    });
    expect(r.success).toBe(false);
  });
});
