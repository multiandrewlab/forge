export interface CommentAuthor {
  id: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  postId: string;
  author: CommentAuthor | null;
  parentId: string | null;
  lineNumber: number | null;
  revisionId: string | null;
  revisionNumber: number | null;
  body: string;
  createdAt: string;
  updatedAt: string;
}
