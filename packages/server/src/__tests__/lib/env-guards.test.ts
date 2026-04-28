import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { isE2EFlagSet, assertProductionGuards, generateE2ESecret } from '../../lib/env-guards.js';
import { readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('isE2EFlagSet', () => {
  it('returns true for literal "1"', () => {
    expect(isE2EFlagSet('1')).toBe(true);
  });

  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['true', 'true'],
    ['01', '01'],
    ['yes', 'yes'],
    ['"1 " (trailing space — should be accepted after trim)', '1 '],
    ['"\\t1" (leading tab — should be accepted after trim)', '\t1'],
    ['"11"', '11'],
    ['"0"', '0'],
  ])('handles %s correctly', (_label, value) => {
    if (value === '1 ' || value === '\t1') {
      expect(isE2EFlagSet(value)).toBe(true);
    } else {
      expect(isE2EFlagSet(value)).toBe(false);
    }
  });
});

describe('assertProductionGuards', () => {
  it('allows NODE_ENV=development with all flags set', () => {
    expect(() =>
      assertProductionGuards({
        NODE_ENV: 'development',
        ENABLE_TEST_ROUTES: '1',
        LLM_PROVIDER: 'mock',
        E2E_MODE: '1',
      }),
    ).not.toThrow();
  });

  it.each([
    [{ NODE_ENV: 'production', ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'],
    [{ NODE_ENV: 'production', LLM_PROVIDER: 'mock' }, 'LLM_PROVIDER=mock'],
    [{ NODE_ENV: 'production', E2E_MODE: '1' }, 'E2E_MODE=1'],
    [{ NODE_ENV: 'staging', ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'],
    [{ ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'], // NODE_ENV unset
  ])('rejects %j', (env, expectedOffender) => {
    expect(() => assertProductionGuards(env)).toThrow(expectedOffender);
  });

  it('allows NODE_ENV=test with no flags', () => {
    expect(() => assertProductionGuards({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('allows NODE_ENV=production with no flags set', () => {
    expect(() => assertProductionGuards({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('reports multiple offenders in one error', () => {
    expect(() =>
      assertProductionGuards({
        NODE_ENV: 'production',
        ENABLE_TEST_ROUTES: '1',
        LLM_PROVIDER: 'mock',
      }),
    ).toThrow(/ENABLE_TEST_ROUTES=1, LLM_PROVIDER=mock/);
  });
});

describe('generateE2ESecret', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'forge-secret-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('writes a 64-hex-char secret to the given path with mode 0600', () => {
    const path = join(scratch, 'forge-e2e-secret');
    const secret = generateE2ESecret(path);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path, 'utf8')).toBe(secret);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('regenerates unconditionally — second call returns a different secret and overwrites the file', () => {
    const path = join(scratch, 'forge-e2e-secret');
    const first = generateE2ESecret(path);
    const second = generateE2ESecret(path);
    expect(second).not.toBe(first); // proves NOT cached / NOT no-op
    expect(readFileSync(path, 'utf8')).toBe(second); // file holds the latest value
  });
});
