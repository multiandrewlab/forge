import type { AuthProvider, ContentType, Visibility } from '../constants/index.js';

export interface User {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  authProvider: AuthProvider;
  createdAt: Date;
  updatedAt: Date;
}

export interface Post {
  id: string;
  authorId: string;
  title: string;
  contentType: ContentType;
  language: string | null;
  visibility: Visibility;
  isDraft: boolean;
  forkedFromId: string | null;
  linkUrl: string | null;
  linkPreview: LinkPreview | null;
  voteCount: number;
  viewCount: number;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkPreview {
  title: string;
  description: string;
  image: string | null;
  readingTime: number | null;
}

export type { AuthTokens, AuthResponse } from './user.js';
export type { PostRevision, PostWithRevision } from './post.js';
