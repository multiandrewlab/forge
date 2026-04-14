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
export type {
  PostAuthor,
  PostWithAuthor,
  FeedSort,
  FeedFilter,
  FeedContentType,
  FeedResponse,
  FeedQuery,
} from './feed.js';
export type { VoteValue, VoteResponse } from './vote.js';
export type { BookmarkToggleResponse } from './bookmark.js';
export type { Tag, TagSubscriptionResponse } from './tag.js';
export type { Comment, CommentAuthor } from './comment.js';
export type {
  AuthMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PresenceMessage,
  ClientMessage,
  AuthOkMessage,
  AuthErrorMessage,
  AuthExpiredMessage,
  CommentNewMessage,
  CommentUpdatedMessage,
  CommentDeletedMessage,
  VoteUpdatedMessage,
  RevisionNewMessage,
  PresenceUpdateMessage,
  PostNewMessage,
  PostUpdatedMessage,
  ServerMessage,
} from './websocket.js';
export {
  authMessageSchema,
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  presenceMessageSchema,
  clientMessageSchema,
  authOkMessageSchema,
  authErrorMessageSchema,
  authExpiredMessageSchema,
  commentNewMessageSchema,
  commentUpdatedMessageSchema,
  commentDeletedMessageSchema,
  voteUpdatedMessageSchema,
  revisionNewMessageSchema,
  presenceUpdateMessageSchema,
  postNewMessageSchema,
  postUpdatedMessageSchema,
  serverMessageSchema,
} from './websocket.js';
export type {
  SearchQuery,
  SearchSnippet,
  AiAction,
  AiSearchFilters,
  UserSummary,
  SearchResponse,
} from './search.js';
export { searchQuerySchema, aiSearchFiltersSchema } from './search.js';
export type { PromptVariable } from './prompt.js';
export { extractVariables, assemblePrompt } from './prompt.js';
