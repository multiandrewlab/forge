import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const seedPath = fileURLToPath(new URL('../../../../../scripts/seed.sql', import.meta.url));
const seedContent = readFileSync(seedPath, 'utf8');

describe('scripts/seed.sql shape', () => {
  it('contains no psql meta-commands (lines starting with backslash)', () => {
    const offenders = seedContent
      .split('\n')
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) => /^\s*\\/.test(line));
    if (offenders.length > 0) {
      const messages = offenders.map((o) => `  line ${o.idx}: ${o.line.trim()}`).join('\n');
      throw new Error(
        `seed.sql must contain only standard SQL — psql meta-commands break the ` +
          `__test__/reset endpoint, which executes seed.sql via the pg driver.\n${messages}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it('contains a BEGIN/COMMIT transaction wrapper', () => {
    expect(seedContent).toMatch(/\bBEGIN;/);
    expect(seedContent).toMatch(/COMMIT;\s*$/);
  });
});
