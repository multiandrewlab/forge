import { describe, it, expect } from 'vitest';
import {
  ALLOWED_MIME_PREFIXES,
  ALLOWED_MIME_EXACT,
  MAX_FILE_SIZE,
  INLINE_THRESHOLD,
  isAllowedMimeType,
  stageFileSchema,
  removeFileSchema,
  fileMetadataSchema,
} from '../../validators/file';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
describe('file constants', () => {
  it('MAX_FILE_SIZE should be 10 MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });

  it('INLINE_THRESHOLD should be 64 KB', () => {
    expect(INLINE_THRESHOLD).toBe(64 * 1024);
  });

  it('ALLOWED_MIME_PREFIXES should contain text/', () => {
    expect(ALLOWED_MIME_PREFIXES).toContain('text/');
  });

  it('ALLOWED_MIME_EXACT should contain expected MIME types', () => {
    expect(ALLOWED_MIME_EXACT).toContain('application/json');
    expect(ALLOWED_MIME_EXACT).toContain('application/yaml');
    expect(ALLOWED_MIME_EXACT).toContain('application/x-yaml');
    expect(ALLOWED_MIME_EXACT).toContain('image/png');
    expect(ALLOWED_MIME_EXACT).toContain('image/jpeg');
    expect(ALLOWED_MIME_EXACT).toContain('image/gif');
    expect(ALLOWED_MIME_EXACT).toContain('image/webp');
  });

  it('ALLOWED_MIME_EXACT should NOT contain image/svg+xml', () => {
    expect(ALLOWED_MIME_EXACT).not.toContain('image/svg+xml');
  });
});

// ---------------------------------------------------------------------------
// isAllowedMimeType
// ---------------------------------------------------------------------------
describe('isAllowedMimeType', () => {
  // -- prefix matches --
  it('should allow text/plain', () => {
    expect(isAllowedMimeType('text/plain')).toBe(true);
  });

  it('should allow text/typescript', () => {
    expect(isAllowedMimeType('text/typescript')).toBe(true);
  });

  it('should allow text/markdown', () => {
    expect(isAllowedMimeType('text/markdown')).toBe(true);
  });

  it('should allow text/html', () => {
    expect(isAllowedMimeType('text/html')).toBe(true);
  });

  // -- exact matches --
  it('should allow application/json', () => {
    expect(isAllowedMimeType('application/json')).toBe(true);
  });

  it('should allow application/yaml', () => {
    expect(isAllowedMimeType('application/yaml')).toBe(true);
  });

  it('should allow application/x-yaml', () => {
    expect(isAllowedMimeType('application/x-yaml')).toBe(true);
  });

  it('should allow image/png', () => {
    expect(isAllowedMimeType('image/png')).toBe(true);
  });

  it('should allow image/jpeg', () => {
    expect(isAllowedMimeType('image/jpeg')).toBe(true);
  });

  it('should allow image/gif', () => {
    expect(isAllowedMimeType('image/gif')).toBe(true);
  });

  it('should allow image/webp', () => {
    expect(isAllowedMimeType('image/webp')).toBe(true);
  });

  // -- rejected types --
  it('should reject image/svg+xml (XSS vector)', () => {
    expect(isAllowedMimeType('image/svg+xml')).toBe(false);
  });

  it('should reject application/octet-stream', () => {
    expect(isAllowedMimeType('application/octet-stream')).toBe(false);
  });

  it('should reject application/javascript', () => {
    expect(isAllowedMimeType('application/javascript')).toBe(false);
  });

  it('should reject video/mp4', () => {
    expect(isAllowedMimeType('video/mp4')).toBe(false);
  });

  it('should reject empty string', () => {
    expect(isAllowedMimeType('')).toBe(false);
  });

  it('should reject null', () => {
    expect(isAllowedMimeType(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(isAllowedMimeType(undefined)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// stageFileSchema
// ---------------------------------------------------------------------------
describe('stageFileSchema', () => {
  it('should accept valid input with filename only', () => {
    const result = stageFileSchema.safeParse({ filename: 'main.ts' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filename).toBe('main.ts');
    }
  });

  it('should accept filename with optional mimeType', () => {
    const result = stageFileSchema.safeParse({
      filename: 'data.json',
      mimeType: 'application/json',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mimeType).toBe('application/json');
    }
  });

  it('should reject missing filename', () => {
    const result = stageFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty filename', () => {
    const result = stageFileSchema.safeParse({ filename: '' });
    expect(result.success).toBe(false);
  });

  it('should reject filename longer than 255 characters', () => {
    const result = stageFileSchema.safeParse({ filename: 'a'.repeat(256) });
    expect(result.success).toBe(false);
  });

  it('should accept filename of exactly 255 characters', () => {
    const result = stageFileSchema.safeParse({ filename: 'a'.repeat(255) });
    expect(result.success).toBe(true);
  });

  it('should strip unknown properties', () => {
    const result = stageFileSchema.safeParse({ filename: 'test.ts', extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra' in result.data).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// removeFileSchema
// ---------------------------------------------------------------------------
describe('removeFileSchema', () => {
  it('should accept valid UUID', () => {
    const result = removeFileSchema.safeParse({
      fileId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-UUID string', () => {
    const result = removeFileSchema.safeParse({ fileId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing fileId', () => {
    const result = removeFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject empty fileId', () => {
    const result = removeFileSchema.safeParse({ fileId: '' });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fileMetadataSchema
// ---------------------------------------------------------------------------
describe('fileMetadataSchema', () => {
  it('should accept valid metadata with all fields', () => {
    const result = fileMetadataSchema.safeParse({
      filename: 'main.ts',
      mimeType: 'text/typescript',
      fileSize: 1024,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filename).toBe('main.ts');
      expect(result.data.mimeType).toBe('text/typescript');
      expect(result.data.fileSize).toBe(1024);
    }
  });

  it('should accept metadata with only filename', () => {
    const result = fileMetadataSchema.safeParse({ filename: 'readme.md' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mimeType).toBeUndefined();
      expect(result.data.fileSize).toBeUndefined();
    }
  });

  it('should reject fileSize exceeding MAX_FILE_SIZE', () => {
    const result = fileMetadataSchema.safeParse({
      filename: 'large.bin',
      fileSize: MAX_FILE_SIZE + 1,
    });
    expect(result.success).toBe(false);
  });

  it('should accept fileSize exactly at MAX_FILE_SIZE', () => {
    const result = fileMetadataSchema.safeParse({
      filename: 'large.bin',
      fileSize: MAX_FILE_SIZE,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative fileSize', () => {
    const result = fileMetadataSchema.safeParse({
      filename: 'test.ts',
      fileSize: -1,
    });
    expect(result.success).toBe(false);
  });

  it('should reject zero fileSize', () => {
    const result = fileMetadataSchema.safeParse({
      filename: 'test.ts',
      fileSize: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty filename', () => {
    const result = fileMetadataSchema.safeParse({ filename: '' });
    expect(result.success).toBe(false);
  });

  it('should strip unknown properties', () => {
    const result = fileMetadataSchema.safeParse({ filename: 'test.ts', extra: 'field' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('extra' in result.data).toBe(false);
    }
  });
});
