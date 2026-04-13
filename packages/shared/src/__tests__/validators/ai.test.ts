import { describe, it, expect } from 'vitest';
import { aiCompleteRequestSchema } from '../../validators/ai.js';

describe('aiCompleteRequestSchema', () => {
  it('accepts a well-formed request', () => {
    const r = aiCompleteRequestSchema.safeParse({
      before: 'function add(a, b) {',
      after: '}',
      language: 'javascript',
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing before', () => {
    const r = aiCompleteRequestSchema.safeParse({ after: '}', language: 'javascript' });
    expect(r.success).toBe(false);
  });

  it('allows empty before/after strings', () => {
    const r = aiCompleteRequestSchema.safeParse({ before: '', after: '', language: 'markdown' });
    expect(r.success).toBe(true);
  });

  it('rejects before longer than 8000 chars', () => {
    const r = aiCompleteRequestSchema.safeParse({
      before: 'x'.repeat(8001),
      after: '',
      language: 'javascript',
    });
    expect(r.success).toBe(false);
  });

  it('rejects invalid language type', () => {
    const r = aiCompleteRequestSchema.safeParse({ before: '', after: '', language: 42 });
    expect(r.success).toBe(false);
  });
});
