import { describe, it, expect } from 'vitest';
import {
  requestVideoUploadUrlSchema,
  videoTagSchema,
  videoMetadataSchema,
} from '../../validators/video.js';

describe('requestVideoUploadUrlSchema', () => {
  it('accepts a 1-byte file', () => {
    const r = requestVideoUploadUrlSchema.safeParse({ filename: 'a.mp4', fileSizeBytes: 1 });
    expect(r.success).toBe(true);
  });

  it('accepts the 10 GB upper bound exactly', () => {
    const r = requestVideoUploadUrlSchema.safeParse({
      filename: 'a.mp4',
      fileSizeBytes: 10 * 1024 * 1024 * 1024,
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty filename', () => {
    const r = requestVideoUploadUrlSchema.safeParse({ filename: '', fileSizeBytes: 1 });
    expect(r.success).toBe(false);
  });

  it('rejects filename > 255 chars', () => {
    const r = requestVideoUploadUrlSchema.safeParse({
      filename: 'a'.repeat(256),
      fileSizeBytes: 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects > 10 GB', () => {
    const r = requestVideoUploadUrlSchema.safeParse({
      filename: 'a.mp4',
      fileSizeBytes: 10 * 1024 * 1024 * 1024 + 1,
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative size', () => {
    const r = requestVideoUploadUrlSchema.safeParse({ filename: 'a.mp4', fileSizeBytes: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects zero size', () => {
    const r = requestVideoUploadUrlSchema.safeParse({ filename: 'a.mp4', fileSizeBytes: 0 });
    expect(r.success).toBe(false);
  });

  it('rejects non-integer size', () => {
    const r = requestVideoUploadUrlSchema.safeParse({ filename: 'a.mp4', fileSizeBytes: 1.5 });
    expect(r.success).toBe(false);
  });
});

describe('videoTagSchema', () => {
  it.each(['typescript', 'web-dev', 'a', 'a1', 'a1-b2', 'a'.repeat(40)])('accepts %s', (s) => {
    expect(videoTagSchema.safeParse(s).success).toBe(true);
  });

  it.each(['', '-x', 'A', 'a b', 'a_b', '_x', 'a@b', 'a'.repeat(41)])('rejects %s', (s) => {
    expect(videoTagSchema.safeParse(s).success).toBe(false);
  });
});

describe('videoMetadataSchema', () => {
  it('happy path: title + description + 1 tag', () => {
    const r = videoMetadataSchema.safeParse({
      title: 'A talk',
      description: 'about things',
      tags: ['typescript'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts 8 tags', () => {
    const r = videoMetadataSchema.safeParse({
      title: 't',
      description: 'd',
      tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts title = 120 chars exactly', () => {
    const r = videoMetadataSchema.safeParse({
      title: 'x'.repeat(120),
      description: 'd',
      tags: ['a'],
    });
    expect(r.success).toBe(true);
  });

  it('accepts description = 1000 chars exactly', () => {
    const r = videoMetadataSchema.safeParse({
      title: 't',
      description: 'x'.repeat(1000),
      tags: ['a'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects 0 tags', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 't',
        description: 'd',
        tags: [],
      }).success,
    ).toBe(false);
  });

  it('rejects > 8 tags', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 't',
        description: 'd',
        tags: Array(9).fill('a'),
      }).success,
    ).toBe(false);
  });

  it('rejects empty title', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: '',
        description: 'd',
        tags: ['a'],
      }).success,
    ).toBe(false);
  });

  it('rejects title > 120', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 'x'.repeat(121),
        description: 'd',
        tags: ['a'],
      }).success,
    ).toBe(false);
  });

  it('rejects empty description', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 't',
        description: '',
        tags: ['a'],
      }).success,
    ).toBe(false);
  });

  it('rejects description > 1000', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 't',
        description: 'x'.repeat(1001),
        tags: ['a'],
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid tag inside the array', () => {
    expect(
      videoMetadataSchema.safeParse({
        title: 't',
        description: 'd',
        tags: ['valid', 'INVALID UPPER'],
      }).success,
    ).toBe(false);
  });
});
