import { describe, it, expect } from 'vitest';
import {
  sanitizeFilename,
  routeStorage,
  toPostFile,
  stagingKey,
  permanentKey,
} from '../../services/files.js';
import type { PostFileRow } from '../../db/queries/types.js';
import { INLINE_THRESHOLD } from '@forge/shared';

// ---------------------------------------------------------------------------
// sanitizeFilename
// ---------------------------------------------------------------------------

describe('sanitizeFilename', () => {
  it('passes through a normal filename unchanged', () => {
    expect(sanitizeFilename('main.ts')).toBe('main.ts');
  });

  it('strips directory components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
  });

  it('replaces unsafe characters with underscores', () => {
    expect(sanitizeFilename('file name (1).ts')).toBe('file_name__1_.ts');
  });

  it('strips null bytes', () => {
    expect(sanitizeFilename('file\x00name.ts')).toBe('filename.ts');
  });

  it('allows three dots (not a reserved name)', () => {
    expect(sanitizeFilename('...')).toBe('...');
  });

  it('rejects a single dot', () => {
    expect(() => sanitizeFilename('.')).toThrow('Invalid filename');
  });

  it('rejects double dots', () => {
    expect(() => sanitizeFilename('..')).toThrow('Invalid filename');
  });

  it('truncates filenames longer than 255 characters', () => {
    const long = 'a'.repeat(300);
    const result = sanitizeFilename(long);
    expect(result.length).toBe(255);
    expect(result).toBe('a'.repeat(255));
  });

  it('rejects an empty string', () => {
    expect(() => sanitizeFilename('')).toThrow('Invalid filename');
  });

  it('handles filenames with only unsafe characters', () => {
    // All replaced with _, then not empty so it survives
    expect(sanitizeFilename('$@!')).toBe('___');
  });

  it('strips Windows-style directory separators via basename', () => {
    // path.basename handles backslash on POSIX as a literal char,
    // but forward-slash is always stripped
    expect(sanitizeFilename('C:/Users/test/file.ts')).toBe('file.ts');
  });

  it('strips Windows-style backslash directory traversal on all platforms', () => {
    expect(sanitizeFilename('..\\..\\secret.txt')).toBe('secret.txt');
  });

  it('strips mixed forward/backslash traversal', () => {
    expect(sanitizeFilename('..\\../..\\secret.txt')).toBe('secret.txt');
  });

  it('strips UNC-style paths', () => {
    expect(sanitizeFilename('\\\\server\\share\\file.txt')).toBe('file.txt');
  });
});

// ---------------------------------------------------------------------------
// routeStorage
// ---------------------------------------------------------------------------

describe('routeStorage', () => {
  it('returns "inline" for text MIME at threshold', () => {
    expect(routeStorage(INLINE_THRESHOLD, 'text/plain')).toBe('inline');
  });

  it('returns "inline" for text MIME below threshold', () => {
    expect(routeStorage(1, 'text/plain')).toBe('inline');
    expect(routeStorage(0, 'text/plain')).toBe('inline');
  });

  it('returns "object" for text MIME above threshold', () => {
    expect(routeStorage(INLINE_THRESHOLD + 1, 'text/plain')).toBe('object');
  });

  it('returns "object" for binary MIME regardless of size', () => {
    expect(routeStorage(0, 'image/png')).toBe('object');
    expect(routeStorage(1, 'image/png')).toBe('object');
    expect(routeStorage(INLINE_THRESHOLD, 'image/png')).toBe('object');
    expect(routeStorage(INLINE_THRESHOLD + 1, 'image/png')).toBe('object');
  });

  it('returns "object" for each binary MIME at small size', () => {
    expect(routeStorage(1, 'image/jpeg')).toBe('object');
    expect(routeStorage(1, 'image/gif')).toBe('object');
    expect(routeStorage(1, 'image/webp')).toBe('object');
  });

  it('falls back to size-based routing when mime is undefined', () => {
    expect(routeStorage(1, undefined)).toBe('inline');
    expect(routeStorage(INLINE_THRESHOLD + 1, undefined)).toBe('object');
  });

  it('falls back to size-based routing when mime is null', () => {
    expect(routeStorage(1, null)).toBe('inline');
  });
});

// ---------------------------------------------------------------------------
// toPostFile
// ---------------------------------------------------------------------------

const samplePostFileRow: PostFileRow = {
  id: '110e8400-e29b-41d4-a716-446655440000',
  post_id: '220e8400-e29b-41d4-a716-446655440000',
  revision_id: '330e8400-e29b-41d4-a716-446655440000',
  filename: 'main.ts',
  content: 'console.log("hello");',
  storage_key: 'posts/220e/main.ts',
  mime_type: 'text/typescript',
  file_size: 21,
  sort_order: 0,
  created_at: new Date('2026-01-01'),
};

describe('toPostFile', () => {
  it('transforms PostFileRow to PostFile DTO with camelCase keys', () => {
    const result = toPostFile(samplePostFileRow);

    expect(result).toEqual({
      id: '110e8400-e29b-41d4-a716-446655440000',
      postId: '220e8400-e29b-41d4-a716-446655440000',
      revisionId: '330e8400-e29b-41d4-a716-446655440000',
      filename: 'main.ts',
      mimeType: 'text/typescript',
      fileSize: 21,
      sortOrder: 0,
      createdAt: new Date('2026-01-01'),
    });
  });

  it('does not expose content or storage_key in the DTO', () => {
    const result = toPostFile(samplePostFileRow);
    expect(result).not.toHaveProperty('content');
    expect(result).not.toHaveProperty('storage_key');
    expect(result).not.toHaveProperty('storageKey');
  });

  it('handles null revision_id', () => {
    const row: PostFileRow = { ...samplePostFileRow, revision_id: null };
    const result = toPostFile(row);
    expect(result.revisionId).toBeNull();
  });

  it('handles null mime_type and file_size', () => {
    const row: PostFileRow = {
      ...samplePostFileRow,
      mime_type: null,
      file_size: null,
    };
    const result = toPostFile(row);
    expect(result.mimeType).toBeNull();
    expect(result.fileSize).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// stagingKey
// ---------------------------------------------------------------------------

describe('stagingKey', () => {
  it('returns the correct staging path', () => {
    const result = stagingKey('user-123', 'file-456', 'main.ts');
    expect(result).toBe('staging/user-123/file-456/main.ts');
  });

  it('uses all three path segments', () => {
    const result = stagingKey('u', 'f', 'x.txt');
    expect(result).toBe('staging/u/f/x.txt');
  });
});

// ---------------------------------------------------------------------------
// permanentKey
// ---------------------------------------------------------------------------

describe('permanentKey', () => {
  it('returns the correct permanent path', () => {
    const result = permanentKey('post-abc', 'rev-123', 'index.html');
    expect(result).toBe('posts/post-abc/revisions/rev-123/index.html');
  });

  it('uses all three path segments', () => {
    const result = permanentKey('p', 'r', 'f.ts');
    expect(result).toBe('posts/p/revisions/r/f.ts');
  });
});
