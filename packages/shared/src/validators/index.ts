import { z } from 'zod';
import { ContentType, Visibility } from '../constants/index.js';

export const createPostSchema = z.object({
  title: z.string().min(1).max(255),
  contentType: z.enum([
    ContentType.Snippet,
    ContentType.Prompt,
    ContentType.Document,
    ContentType.Link,
  ]),
  language: z.string().nullable().optional(),
  visibility: z.enum([Visibility.Public, Visibility.Private]).default(Visibility.Public),
  isDraft: z.boolean().default(true),
});

export type CreatePostInput = z.infer<typeof createPostSchema>;

export { loginSchema, registerSchema, updateProfileSchema } from './auth.js';

export type { LoginInput, RegisterInput, UpdateProfileInput } from './auth.js';
