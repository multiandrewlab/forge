import path from 'node:path';
import type { PostFile } from '@forge/shared';
import { INLINE_THRESHOLD } from '@forge/shared';
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
  let name = path.basename(raw);
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
 * object storage based on its size in bytes.
 *
 * Files at or below {@link INLINE_THRESHOLD} (64 KB) are inlined; larger
 * files go to object storage.
 */
export function routeStorage(sizeBytes: number): 'inline' | 'object' {
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
