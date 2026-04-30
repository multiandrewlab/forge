import { z } from 'zod';
import type { ContentType } from '../constants/index.js';

export const searchQuerySchema = z.object({
  q: z.string().max(200),
  type: z.enum(['snippet', 'prompt', 'document', 'link']).optional(),
  tag: z.string().max(50).optional(),
  fuzzy: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val === 'true';
      }
      return val;
    }, z.boolean())
    .optional(),
  ai: z
    .preprocess((val) => {
      if (typeof val === 'string') {
        return val === 'true';
      }
      return val;
    }, z.boolean())
    .optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  // New fields (Issue #49):
  author: z.string().min(1).max(100).optional(),
  since: z.enum(['today', '7d', '30d']).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

export const aiSearchFiltersSchema = z.object({
  tags: z.array(z.string()),
  language: z.string().nullable(),
  contentType: z.string().nullable(),
  textQuery: z.string(),
});

export interface AiSearchFilters {
  tags: string[];
  language: string | null;
  contentType: string | null;
  textQuery: string;
}

export type SearchQuery = z.infer<typeof searchQuerySchema>;

export interface SearchSnippet {
  id: string;
  title: string;
  contentType: ContentType;
  language: string | null;
  excerpt: string;
  authorId: string;
  authorDisplayName: string;
  authorAvatarUrl: string | null;
  rank: number;
  matchedBy: 'tsvector' | 'trigram';
}

export interface AiAction {
  label: string;
  action: string;
  params: Record<string, string>;
}

export interface UserSummary {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  postCount: number;
}

export interface SearchResponse {
  snippets: SearchSnippet[];
  aiActions: AiAction[];
  people: UserSummary[];
  query: string;
  totalResults: number;
  page: number;
  totalPages: number;
  aiResolvedFilters?: {
    tag?: string;
    type?: ContentType;
  };
}
