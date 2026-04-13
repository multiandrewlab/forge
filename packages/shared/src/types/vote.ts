export type VoteValue = 1 | -1;

export interface VoteResponse {
  voteCount: number;
  userVote: VoteValue | null;
}
