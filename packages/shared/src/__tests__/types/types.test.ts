import { describe, it, expect } from 'vitest';
import type { VoteValue, VoteResponse } from '../../types/vote';
import type { BookmarkToggleResponse } from '../../types/bookmark';
import type { Tag, TagSubscriptionResponse } from '../../types/tag';

describe('shared type exports', () => {
  it('VoteResponse shape is correct', () => {
    const response: VoteResponse = { voteCount: 5, userVote: 1 };
    expect(response.voteCount).toBe(5);
    expect(response.userVote).toBe(1);
  });

  it('VoteResponse allows null userVote', () => {
    const response: VoteResponse = { voteCount: 0, userVote: null };
    expect(response.userVote).toBeNull();
  });

  it('VoteValue accepts 1 and -1', () => {
    const up: VoteValue = 1;
    const down: VoteValue = -1;
    expect(up).toBe(1);
    expect(down).toBe(-1);
  });

  it('BookmarkToggleResponse shape is correct', () => {
    const response: BookmarkToggleResponse = { bookmarked: true };
    expect(response.bookmarked).toBe(true);
  });

  it('Tag shape is correct', () => {
    const tag: Tag = { id: 't1', name: 'typescript', postCount: 5 };
    expect(tag.id).toBe('t1');
    expect(tag.name).toBe('typescript');
    expect(tag.postCount).toBe(5);
  });

  it('TagSubscriptionResponse shape is correct', () => {
    const response: TagSubscriptionResponse = { subscribed: true };
    expect(response.subscribed).toBe(true);
  });
});
