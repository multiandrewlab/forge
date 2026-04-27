export interface UserProfileBadge {
  type: 'top_contributor' | 'tag_expert';
  label: string;
  rank?: number; // 1-3 for top_contributor
}

export interface UserProfileStats {
  postCount: number;
  totalVotes: number;
  topTags: Array<{ tagName: string; voteSum: number }>;
}

export interface UserProfilePost {
  id: string;
  title: string;
  contentType: string;
  language: string | null;
  voteCount: number;
  createdAt: string;
  tags: string[];
}

export interface UserProfileResponse {
  user: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
    createdAt: string;
  };
  stats: UserProfileStats;
  badges: UserProfileBadge[];
  posts: UserProfilePost[];
  cursor: string | null;
}
