import { z } from 'zod';

export const AI_CONTEXT_MAX = 8000;

export const aiCompleteRequestSchema = z.object({
  before: z.string().max(AI_CONTEXT_MAX),
  after: z.string().max(AI_CONTEXT_MAX),
  language: z.string().min(1).max(32),
});

export type AiCompleteRequest = z.infer<typeof aiCompleteRequestSchema>;

export const AI_DESCRIPTION_MAX = 2000;

export const aiGenerateRequestSchema = z.object({
  description: z.string().min(1).max(AI_DESCRIPTION_MAX),
  contentType: z.enum(['snippet', 'prompt', 'document']),
  language: z.string().min(1).max(32).optional(),
});

export type AiGenerateRequest = z.infer<typeof aiGenerateRequestSchema>;
