import { z } from 'zod';

// Cap matches the Cloudflare Stream per-asset upper bound (10 GiB).
const MAX_VIDEO_BYTES = 10 * 1024 * 1024 * 1024;

export const requestVideoUploadUrlSchema = z.object({
  filename: z.string().min(1).max(255),
  fileSizeBytes: z.number().int().positive().max(MAX_VIDEO_BYTES),
});

export type RequestVideoUploadUrlInput = z.infer<typeof requestVideoUploadUrlSchema>;

// Tag format: lowercase alphanumerics, hyphens, must start with [a-z0-9],
// length 1-40. Matches the wider tag normalisation in tags/index.ts.
export const videoTagSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);

export const videoMetadataSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(1000),
  tags: z.array(videoTagSchema).min(1).max(8),
});

export type VideoMetadata = z.infer<typeof videoMetadataSchema>;
