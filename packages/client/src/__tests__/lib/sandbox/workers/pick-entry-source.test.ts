import { describe, it, expect } from 'vitest';
import { pickEntrySource } from '../../../../lib/sandbox/workers/pick-entry-source.js';

describe('pickEntrySource', () => {
  it('returns the content of the file whose filename matches entryFile', () => {
    const files = [
      { filename: 'main.ts', content: 'const x: string = "hi";' },
      { filename: 'lib.ts', content: 'export const y = 1;' },
    ];
    expect(pickEntrySource(files, 'main.ts')).toBe('const x: string = "hi";');
  });

  it('throws when entryFile is not in files', () => {
    expect(() => pickEntrySource([], 'main.ts')).toThrow(/main\.ts/);
  });

  it('throws when files is empty even if entryFile is empty string', () => {
    expect(() => pickEntrySource([], '')).toThrow();
  });

  it('returns empty string content cleanly (no truthiness check on content)', () => {
    expect(pickEntrySource([{ filename: 'main.ts', content: '' }], 'main.ts')).toBe('');
  });

  it('returns the first match when filenames duplicate (Array.find semantics)', () => {
    const files = [
      { filename: 'main.ts', content: 'first' },
      { filename: 'main.ts', content: 'second' },
    ];
    expect(pickEntrySource(files, 'main.ts')).toBe('first');
  });

  it('matches filenames case-sensitively', () => {
    expect(() => pickEntrySource([{ filename: 'main.ts', content: 'x' }], 'Main.ts')).toThrow(
      /Main\.ts/,
    );
  });
});
