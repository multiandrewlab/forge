import { z } from 'zod';

export const createCommentSchema = z.object({
  body: z.string().min(1).max(10000),
  parentId: z.string().uuid().nullable().optional(),
  lineNumber: z.number().int().min(0).nullable().optional(),
  revisionId: z.string().uuid().nullable().optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  body: z.string().min(1).max(10000),
});

export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
