import { describe, it, expect } from 'vitest';
import { assertCfEnv } from '../../lib/cf-stream-config.js';

describe('assertCfEnv', () => {
  const full = {
    NODE_ENV: 'production',
    CF_ACCOUNT_ID: 'a',
    CF_STREAM_API_TOKEN: 't',
    CF_STREAM_WEBHOOK_SECRET: 's',
    CF_STREAM_SIGNING_KEY_ID: 'kid',
    CF_STREAM_SIGNING_KEY_PEM: '-----BEGIN-----',
    CF_STREAM_CUSTOMER_SUBDOMAIN: 'sub',
  };

  it('does nothing in non-production', () => {
    expect(() => assertCfEnv({ ...full, NODE_ENV: 'development' })).not.toThrow();
  });

  it('does nothing in test env even with no CF vars', () => {
    expect(() => assertCfEnv({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('rejects MOCK_CF_STREAM=1 in production', () => {
    expect(() => assertCfEnv({ ...full, MOCK_CF_STREAM: '1' })).toThrow(/MOCK_CF_STREAM/);
  });

  it.each([
    'CF_ACCOUNT_ID',
    'CF_STREAM_API_TOKEN',
    'CF_STREAM_WEBHOOK_SECRET',
    'CF_STREAM_SIGNING_KEY_ID',
    'CF_STREAM_SIGNING_KEY_PEM',
    'CF_STREAM_CUSTOMER_SUBDOMAIN',
  ])('rejects when %s is missing in production', (missing) => {
    const env: Record<string, unknown> = { ...full };
    env[missing] = undefined;
    expect(() => assertCfEnv(env)).toThrow(missing);
  });

  it('rejects when a required var is an empty string in production', () => {
    expect(() => assertCfEnv({ ...full, CF_ACCOUNT_ID: '' })).toThrow(/CF_ACCOUNT_ID/);
  });

  it('passes when all vars present in production', () => {
    expect(() => assertCfEnv(full)).not.toThrow();
  });
});
