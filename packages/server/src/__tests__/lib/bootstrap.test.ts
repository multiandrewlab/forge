import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootGuards } from '../../lib/bootstrap.js';
import * as envGuards from '../../lib/env-guards.js';

describe('runBootGuards', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'forge-bootstrap-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('returns normally for NODE_ENV=test with no flags', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(env, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
      runnerTemp: scratch,
    });

    expect(errors).toEqual([]);
    expect(exits).toEqual([]);
    expect(env.E2E_SECRET).toBeUndefined();
  });

  it('writes a fresh secret and mutates env.E2E_SECRET when ENABLE_TEST_ROUTES=1', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      ENABLE_TEST_ROUTES: '1',
    };

    runBootGuards(env, {
      onError: () => {},
      onExit: () => {},
      runnerTemp: scratch,
    });

    const expectedPath = join(scratch, 'forge-e2e-secret');
    const onDisk = readFileSync(expectedPath, 'utf8');
    expect(onDisk).toMatch(/^[0-9a-f]{64}$/);
    expect(env.E2E_SECRET).toBe(onDisk);
  });

  it('does NOT generate a secret when ENABLE_TEST_ROUTES is unset', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };

    runBootGuards(env, {
      onError: () => {},
      onExit: () => {},
      runnerTemp: scratch,
    });

    expect(env.E2E_SECRET).toBeUndefined();
    expect(existsSync(join(scratch, 'forge-e2e-secret'))).toBe(false);
  });

  it('calls onError matching /refusing to start/i and onExit(1) for production + ENABLE_TEST_ROUTES=1', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      ENABLE_TEST_ROUTES: '1',
    };
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(env, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
      runnerTemp: scratch,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/refusing to start/i);
    expect(exits).toEqual([1]);
    // Should not have continued past exit — no secret written
    expect(env.E2E_SECRET).toBeUndefined();
  });

  it('calls onError matching /llm_provider=mock/i and onExit(1) for production + LLM_PROVIDER=mock', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      LLM_PROVIDER: 'mock',
    };
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(env, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
      runnerTemp: scratch,
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/llm_provider=mock/i);
    expect(exits).toEqual([1]);
  });

  it('falls back to os.tmpdir() when runnerTemp is not provided', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      ENABLE_TEST_ROUTES: '1',
    };
    const fallbackPath = join(tmpdir(), 'forge-e2e-secret');

    try {
      runBootGuards(env, {
        onError: () => {},
        onExit: () => {},
      });

      const onDisk = readFileSync(fallbackPath, 'utf8');
      expect(onDisk).toMatch(/^[0-9a-f]{64}$/);
      expect(env.E2E_SECRET).toBe(onDisk);
    } finally {
      if (existsSync(fallbackPath)) {
        unlinkSync(fallbackPath);
      }
    }
  });

  it('uses env.RUNNER_TEMP when hooks.runnerTemp is undefined', () => {
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      ENABLE_TEST_ROUTES: '1',
      RUNNER_TEMP: scratch,
    };

    runBootGuards(env, {
      onError: () => {},
      onExit: () => {},
    });

    const expectedPath = join(scratch, 'forge-e2e-secret');
    const onDisk = readFileSync(expectedPath, 'utf8');
    expect(onDisk).toMatch(/^[0-9a-f]{64}$/);
    expect(env.E2E_SECRET).toBe(onDisk);
  });

  it('defaults onError to console.error and onExit to process.exit when hooks omitted', () => {
    // For NODE_ENV=test with no flags, the function should be a no-op and not call defaults.
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    expect(() => runBootGuards(env)).not.toThrow();
    expect(env.E2E_SECRET).toBeUndefined();
  });

  it('default onError/onExit fire when hooks omitted and guards fail', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(((_code?: number | string | null) => undefined) as never);

    try {
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        ENABLE_TEST_ROUTES: '1',
      };
      runBootGuards(env);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const firstArg = errorSpy.mock.calls[0]?.[0];
      expect(typeof firstArg).toBe('string');
      expect(String(firstArg)).toMatch(/refusing to start/i);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      errorSpy.mockRestore();
      exitSpy.mockRestore();
    }
  });

  it('coerces non-Error throw values via String(err) before passing to onError', () => {
    const stringSentinel = 'guard-threw-non-error';
    const spy = vi.spyOn(envGuards, 'assertProductionGuards').mockImplementation(() => {
      throw stringSentinel;
    });
    const errors: string[] = [];
    const exits: number[] = [];

    try {
      runBootGuards(
        { NODE_ENV: 'test' },
        {
          onError: (msg) => errors.push(msg),
          onExit: (code) => exits.push(code),
          runnerTemp: scratch,
        },
      );
      expect(errors).toEqual([stringSentinel]);
      expect(exits).toEqual([1]);
    } finally {
      spy.mockRestore();
    }
  });
});
