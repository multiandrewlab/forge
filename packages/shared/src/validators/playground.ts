import { z } from 'zod';

export const playgroundRunSchema = z.object({
  postId: z.string().uuid(),
  variables: z.record(z.string(), z.string()),
});

export type PlaygroundRunInput = z.infer<typeof playgroundRunSchema>;
