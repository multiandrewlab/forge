export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostRow {
  id: string;
  author_id: string;
  title: string;
  content_type: string;
  language: string | null;
  visibility: string;
  is_draft: boolean;
  forked_from_id: string | null;
  link_url: string | null;
  link_preview: Record<string, unknown> | null;
  vote_count: number;
  view_count: number;
  search_vector: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostRevisionRow {
  id: string;
  post_id: string;
  author_id: string | null;
  content: string;
  message: string | null;
  revision_number: number;
  created_at: Date;
}

export type PostWithRevisionRow = PostRow & {
  content: string;
  revision_number: number;
  message: string | null;
};

export interface PostFileRow {
  id: string;
  post_id: string;
  revision_id: string;
  filename: string;
  content: string | null;
  storage_key: string | null;
  mime_type: string | null;
  sort_order: number;
  created_at: Date;
}

export interface TagRow {
  id: string;
  name: string;
  post_count: number;
}

export interface PostTagRow {
  post_id: string;
  tag_id: string;
}

export interface VoteRow {
  user_id: string;
  post_id: string;
  value: number;
}

export interface BookmarkRow {
  user_id: string;
  post_id: string;
  created_at: Date;
}

export interface UserTagSubscriptionRow {
  user_id: string;
  tag_id: string;
}

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string | null;
  parent_id: string | null;
  line_number: number | null;
  revision_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface PromptVariableRow {
  id: string;
  post_id: string;
  name: string;
  placeholder: string | null;
  sort_order: number;
  default_value: string | null;
}
