import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z
  .object({
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
    content: z.string().min(1).optional(),
    linkUrl: z.string().url().optional(),
    tags: z.array(z.string()).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.contentType === ContentType.Link) {
      // Link posts require linkUrl; content is optional
      if (!data.linkUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'linkUrl is required for link posts',
          path: ['linkUrl'],
        });
      }
    } else {
      // Non-link posts require content; strip linkUrl
      if (!data.content || data.content.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'content is required for non-link posts',
          path: ['content'],
        });
      }
      // Strip linkUrl for non-link types
      data.linkUrl = undefined;
    }
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
  stagedFileIds: z.array(z.string().uuid()).optional(),
  removeFileIds: z.array(z.string().uuid()).optional(),
});

export type CreateRevisionInput = z.infer<typeof createRevisionSchema>;
