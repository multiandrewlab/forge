import { describe, it, expect } from 'vitest';
import { runBootGuards } from '../lib/bootstrap.js';

/**
 * Production startup validation (WU10, subtask 10.2).
 *
 * `runBootGuards` is the server's boot pipeline. Beyond the existing
 * production guards (NODE_ENV + ENABLE_TEST_ROUTES, LLM_PROVIDER=mock), it
 * MUST also invoke `assertCfEnv` so production cannot start with
 * `MOCK_CF_STREAM=1` or with any of the required CF_* env vars missing.
 *
 * Tests use `runBootGuards`' onError/onExit hooks to capture failures without
 * actually exiting the process.
 */

describe('production CF Stream startup validation', () => {
  const fullProd = {
    NODE_ENV: 'production',
    JWT_SECRET: 'real-secret',
    CF_ACCOUNT_ID: 'a',
    CF_STREAM_API_TOKEN: 't',
    CF_STREAM_WEBHOOK_SECRET: 's',
    CF_STREAM_SIGNING_KEY_ID: 'k',
    CF_STREAM_SIGNING_KEY_PEM: '-----BEGIN-----',
    CF_STREAM_CUSTOMER_SUBDOMAIN: 'sub',
  } satisfies NodeJS.ProcessEnv;

  it('rejects MOCK_CF_STREAM=1 in production via runBootGuards onError/onExit', () => {
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(
      { ...fullProd, MOCK_CF_STREAM: '1' },
      {
        onError: (msg) => errors.push(msg),
        onExit: (code) => exits.push(code),
      },
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MOCK_CF_STREAM/);
    expect(exits).toEqual([1]);
  });

  it('rejects when CF_STREAM_API_TOKEN is missing in production', () => {
    const env = { ...fullProd } as Record<string, string | undefined>;
    delete env.CF_STREAM_API_TOKEN;
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(env as NodeJS.ProcessEnv, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/CF_STREAM_API_TOKEN/);
    expect(exits).toEqual([1]);
  });

  it('rejects when CF_STREAM_SIGNING_KEY_PEM is missing in production', () => {
    const env = { ...fullProd } as Record<string, string | undefined>;
    delete env.CF_STREAM_SIGNING_KEY_PEM;
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(env as NodeJS.ProcessEnv, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/CF_STREAM_SIGNING_KEY_PEM/);
    expect(exits).toEqual([1]);
  });

  it('passes in development with no CF vars (auto-mock fallback)', () => {
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(
      { NODE_ENV: 'development' },
      {
        onError: (msg) => errors.push(msg),
        onExit: (code) => exits.push(code),
      },
    );

    expect(errors).toEqual([]);
    expect(exits).toEqual([]);
  });

  it('passes in production when all CF vars are present', () => {
    const errors: string[] = [];
    const exits: number[] = [];

    runBootGuards(fullProd, {
      onError: (msg) => errors.push(msg),
      onExit: (code) => exits.push(code),
    });

    expect(errors).toEqual([]);
    expect(exits).toEqual([]);
  });
});
