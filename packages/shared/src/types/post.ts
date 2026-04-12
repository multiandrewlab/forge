import type { Post } from './index.js';

export interface PostRevision {
  id: string;
  postId: string;
  content: string;
  message: string | null;
  revisionNumber: number;
  createdAt: Date;
}

export interface PostWithRevision extends Post {
  revisions: PostRevision[];
}
