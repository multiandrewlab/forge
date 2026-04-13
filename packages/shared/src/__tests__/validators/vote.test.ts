import { describe, it, expect } from 'vitest';
import { voteSchema } from '../../validators/vote';
import type { VoteInput } from '../../validators/vote';

describe('voteSchema', () => {
  it('accepts value 1', () => {
    const result = voteSchema.safeParse({ value: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      const data: VoteInput = result.data;
      expect(data.value).toBe(1);
    }
  });

  it('accepts value -1', () => {
    const result = voteSchema.safeParse({ value: -1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.value).toBe(-1);
    }
  });

  it('rejects value 0', () => {
    const result = voteSchema.safeParse({ value: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects value 2', () => {
    const result = voteSchema.safeParse({ value: 2 });
    expect(result.success).toBe(false);
  });

  it('rejects missing value', () => {
    const result = voteSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects string value', () => {
    const result = voteSchema.safeParse({ value: '1' });
    expect(result.success).toBe(false);
  });
});
