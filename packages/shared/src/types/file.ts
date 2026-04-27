export interface PostFile {
  id: string;
  postId: string;
  revisionId: string | null;
  filename: string;
  mimeType: string | null;
  fileSize: number | null;
  sortOrder: number;
  createdAt: Date;
}
