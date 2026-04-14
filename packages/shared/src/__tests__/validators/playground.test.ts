import { describe, it, expect } from 'vitest';
import { playgroundRunSchema } from '../../validators/playground.js';
import type { PlaygroundRunInput } from '../../validators/playground.js';

describe('playgroundRunSchema', () => {
  const validInput = {
    postId: 'c0000000-0000-0000-0000-000000000099',
    variables: { name: 'world', greeting: 'hello' },
  };

  it('accepts a well-formed request', () => {
    const r = playgroundRunSchema.safeParse(validInput);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.postId).toBe(validInput.postId);
      expect(r.data.variables).toEqual(validInput.variables);
    }
  });

  it('accepts an empty variables record', () => {
    const r = playgroundRunSchema.safeParse({ postId: validInput.postId, variables: {} });
    expect(r.success).toBe(true);
  });

  it('rejects missing postId', () => {
    const r = playgroundRunSchema.safeParse({ variables: { key: 'val' } });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid postId', () => {
    const r = playgroundRunSchema.safeParse({ postId: 'not-a-uuid', variables: {} });
    expect(r.success).toBe(false);
  });

  it('rejects numeric postId', () => {
    const r = playgroundRunSchema.safeParse({ postId: 12345, variables: {} });
    expect(r.success).toBe(false);
  });

  it('rejects missing variables', () => {
    const r = playgroundRunSchema.safeParse({ postId: validInput.postId });
    expect(r.success).toBe(false);
  });

  it('rejects non-string variable values', () => {
    const r = playgroundRunSchema.safeParse({
      postId: validInput.postId,
      variables: { count: 42 },
    });
    expect(r.success).toBe(false);
  });

  it('rejects nested object variable values', () => {
    const r = playgroundRunSchema.safeParse({
      postId: validInput.postId,
      variables: { nested: { deep: 'value' } },
    });
    expect(r.success).toBe(false);
  });

  it('rejects boolean variable values', () => {
    const r = playgroundRunSchema.safeParse({
      postId: validInput.postId,
      variables: { flag: true },
    });
    expect(r.success).toBe(false);
  });

  it('rejects null variable values', () => {
    const r = playgroundRunSchema.safeParse({
      postId: validInput.postId,
      variables: { empty: null },
    });
    expect(r.success).toBe(false);
  });

  it('rejects variables as an array', () => {
    const r = playgroundRunSchema.safeParse({
      postId: validInput.postId,
      variables: ['a', 'b'],
    });
    expect(r.success).toBe(false);
  });

  it('strips unknown top-level properties', () => {
    const r = playgroundRunSchema.safeParse({
      ...validInput,
      extra: 'should be stripped',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect('extra' in r.data).toBe(false);
    }
  });

  it('inferred type matches PlaygroundRunInput', () => {
    // Compile-time check: if PlaygroundRunInput diverges from schema, this will fail to compile
    const input: PlaygroundRunInput = { postId: validInput.postId, variables: { k: 'v' } };
    const r = playgroundRunSchema.safeParse(input);
    expect(r.success).toBe(true);
  });
});
