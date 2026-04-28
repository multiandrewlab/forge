import { z } from 'zod';

// ---------------------------------------------------------------------------
// MIME allowlist
// ---------------------------------------------------------------------------

/**
 * Safe text MIME subtypes. Active-content types (text/html, text/xml) are
 * excluded because the file-content endpoint serves uploads inline — serving
 * HTML under the app's origin enables stored XSS.
 *
 * Code-oriented text/* subtypes (text/x-python, text/x-java-source, etc.)
 * are matched via the `text/x-` prefix below.
 */
export const ALLOWED_MIME_SAFE_TEXT = [
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/tab-separated-values',
] as const;

/**
 * Prefix-matched MIME types. `text/x-` covers programming-language subtypes
 * (text/x-python, text/x-java-source, etc.) which are never rendered as
 * active content by browsers.
 */
export const ALLOWED_MIME_PREFIXES = ['text/x-'] as const;

/** Exact-matched MIME types. SVG is explicitly excluded (XSS vector). */
export const ALLOWED_MIME_EXACT = [
  'application/json',
  'application/yaml',
  'application/x-yaml',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
] as const;

// ---------------------------------------------------------------------------
// Size constants
// ---------------------------------------------------------------------------

/** Maximum allowed file size in bytes (10 MB) */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Files at or below this size are inlined; above are stored externally (64 KB) */
export const INLINE_THRESHOLD = 64 * 1024;

// ---------------------------------------------------------------------------
// MIME validation
// ---------------------------------------------------------------------------

/**
 * Returns true if the given MIME type is in the allowlist.
 * Checks prefix matches first, then exact matches.
 */
export function isAllowedMimeType(mime: string | null | undefined): boolean {
  if (!mime) return false;

  if ((ALLOWED_MIME_SAFE_TEXT as readonly string[]).includes(mime)) return true;

  for (const prefix of ALLOWED_MIME_PREFIXES) {
    if (mime.startsWith(prefix)) return true;
  }

  return (ALLOWED_MIME_EXACT as readonly string[]).includes(mime);
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Schema for staging a new file (upload metadata). */
export const stageFileSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().optional(),
});

export type StageFileInput = z.infer<typeof stageFileSchema>;

/** Schema for identifying a file to remove. */
export const removeFileSchema = z.object({
  fileId: z.string().uuid(),
});

export type RemoveFileInput = z.infer<typeof removeFileSchema>;

/** Schema for file metadata validation (e.g. on upload completion). */
export const fileMetadataSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string().optional(),
  fileSize: z.number().int().min(1).max(MAX_FILE_SIZE).optional(),
});

export type FileMetadataInput = z.infer<typeof fileMetadataSchema>;
