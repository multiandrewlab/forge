import path from 'node:path';
import type { PostFile } from '@forge/shared';
import { INLINE_THRESHOLD, isBinaryMimeType } from '@forge/shared';
import type { PostFileRow } from '../db/queries/types.js';

// ---------------------------------------------------------------------------
// Filename sanitization
// ---------------------------------------------------------------------------

/**
 * Sanitize a user-supplied filename for safe storage.
 *
 * - Strips directory components via `path.basename`
 * - Removes null bytes
 * - Replaces characters outside `[a-zA-Z0-9_.\-]` with `_`
 * - Truncates to 255 characters
 * - Rejects empty, `.`, and `..`
 */
export function sanitizeFilename(raw: string): string {
  // Normalize Windows backslash separators to forward slash before extracting
  // basename. path.basename() only strips the current platform's separator,
  // so on Linux, backslash paths pass through unchanged.
  let name = path.posix.basename(raw.replaceAll('\\', '/'));
  name = name.replaceAll('\x00', '');
  name = name.replace(/[^\w.-]/g, '_');
  name = name.slice(0, 255);
  if (!name || name === '.' || name === '..') {
    throw new Error('Invalid filename');
  }
  return name;
}

// ---------------------------------------------------------------------------
// Storage routing
// ---------------------------------------------------------------------------

/**
 * Decide whether a file should be stored inline (in the database) or in
 * object storage based on its MIME type and size in bytes.
 *
 * Binary MIME types (e.g., image/png) always route to object storage,
 * because inlining them as UTF-8 text corrupts their bytes. Text MIMEs
 * inline at or below {@link INLINE_THRESHOLD} (64 KB) and object-store above it.
 */
export function routeStorage(
  sizeBytes: number,
  mimeType: string | null | undefined,
): 'inline' | 'object' {
  if (isBinaryMimeType(mimeType)) return 'object';
  return sizeBytes <= INLINE_THRESHOLD ? 'inline' : 'object';
}

// ---------------------------------------------------------------------------
// DTO transform
// ---------------------------------------------------------------------------

/**
 * Transform a database {@link PostFileRow} into the public {@link PostFile}
 * DTO.  Maps snake_case columns to camelCase properties and omits internal
 * fields (`content`, `storage_key`).
 */
export function toPostFile(row: PostFileRow): PostFile {
  return {
    id: row.id,
    postId: row.post_id,
    revisionId: row.revision_id,
    filename: row.filename,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}

// ---------------------------------------------------------------------------
// Object-storage key generation
// ---------------------------------------------------------------------------

/**
 * Build the object-storage key for a file in the staging area.
 *
 * Pattern: `staging/{userId}/{fileId}/{filename}`
 */
export function stagingKey(userId: string, fileId: string, filename: string): string {
  return `staging/${userId}/${fileId}/${filename}`;
}

/**
 * Build the object-storage key for a file in its permanent location.
 *
 * Pattern: `posts/{postId}/revisions/{revisionId}/{filename}`
 */
export function permanentKey(postId: string, revisionId: string, filename: string): string {
  return `posts/${postId}/revisions/${revisionId}/${filename}`;
}
