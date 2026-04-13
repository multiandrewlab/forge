import { z } from 'zod';

export const voteSchema = z.object({
  value: z.union([z.literal(1), z.literal(-1)]),
});

export type VoteInput = z.infer<typeof voteSchema>;
