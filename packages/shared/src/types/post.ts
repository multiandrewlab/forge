import type { Post } from './index.js';
import type { PostFile } from './file.js';

export interface PostRevision {
  id: string;
  postId: string;
  authorId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  content: string;
  message: string | null;
  revisionNumber: number;
  createdAt: Date;
}

export interface PostWithRevision extends Post {
  revisions: PostRevision[];
  tags: string[];
  files?: PostFile[];
}
