import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { upsertVote, deleteVote } from '../../../db/queries/votes.js';
import type { VoteRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleVote: VoteRow = {
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  value: 1,
};

describe('vote queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('upsertVote', () => {
    it('inserts or updates a vote and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVote], rowCount: 1 });
      const result = await upsertVote(sampleVote.user_id, sampleVote.post_id, 1);
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO votes (user_id, post_id, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, post_id) DO UPDATE SET value = EXCLUDED.value RETURNING *`,
        [sampleVote.user_id, sampleVote.post_id, 1],
      );
      expect(result).toEqual(sampleVote);
    });
  });

  describe('deleteVote', () => {
    it('deletes a vote and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await deleteVote(sampleVote.user_id, sampleVote.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM votes WHERE user_id = $1 AND post_id = $2',
        [sampleVote.user_id, sampleVote.post_id],
      );
      expect(result).toBe(true);
    });

    it('returns false when no vote existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await deleteVote('u1', 'p1');
      expect(result).toBe(false);
    });
  });
});
