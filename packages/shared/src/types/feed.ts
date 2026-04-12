import type { ContentType } from '../constants/index.js';
import type { Post } from './index.js';

export interface PostAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface PostWithAuthor extends Post {
  author: PostAuthor;
  tags: string[];
}

export type FeedSort = 'trending' | 'recent' | 'top';
export type FeedFilter = 'mine' | 'bookmarked';
export type FeedContentType = ContentType;

export interface FeedResponse {
  posts: PostWithAuthor[];
  cursor: string | null;
}

export interface FeedQuery {
  sort?: FeedSort;
  filter?: FeedFilter;
  tag?: string;
  type?: FeedContentType;
  cursor?: string;
  limit?: number;
}
