import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z.object({
  title: z.string().min(1).max(500),
  contentType: z.enum([
    ContentType.Snippet,
    ContentType.Prompt,
    ContentType.Document,
    ContentType.Link,
  ]),
  language: z.string().nullable().optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).default(Visibility.Public),
  isDraft: z.boolean().default(true),
  content: z.string().min(1),
  tags: z.array(z.string()).max(10).optional(),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export const updatePostSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  contentType: z
    .enum([ContentType.Snippet, ContentType.Prompt, ContentType.Document, ContentType.Link])
    .optional(),
  language: z.string().nullable().optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).optional(),
});

export type UpdatePostInput = z.infer<typeof updatePostSchema>;

export const createRevisionSchema = z.object({
  content: z.string().min(1),
  message: z.string().max(500).optional(),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
