import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findPromptVariablesByPostId,
  createPromptVariable,
} from '../../../db/queries/prompt-variables.js';
import type { PromptVariableRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleVariable: PromptVariableRow = {
  id: 'ff000000-0000-0000-0000-000000000010',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  name: 'component_name',
  placeholder: 'e.g., UserProfile',
  sort_order: 0,
  default_value: 'MyComponent',
};

describe('prompt variable queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findPromptVariablesByPostId', () => {
    it('returns variables ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVariable], rowCount: 1 });
      const result = await findPromptVariablesByPostId(sampleVariable.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM prompt_variables WHERE post_id = $1 ORDER BY sort_order ASC',
        [sampleVariable.post_id],
      );
      expect(result).toEqual([sampleVariable]);
    });
  });

  describe('createPromptVariable', () => {
    it('inserts a variable and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVariable], rowCount: 1 });
      const result = await createPromptVariable({
        postId: sampleVariable.post_id,
        name: 'component_name',
        placeholder: 'e.g., UserProfile',
        sortOrder: 0,
        defaultValue: 'MyComponent',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO prompt_variables (post_id, name, placeholder, sort_order, default_value) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sampleVariable.post_id, 'component_name', 'e.g., UserProfile', 0, 'MyComponent'],
      );
      expect(result).toEqual(sampleVariable);
    });
  });
});
