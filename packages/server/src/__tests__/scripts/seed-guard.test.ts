import { describe, it, expect } from 'vitest';
import { parseSeedTarget, assertSeedAllowed } from '../../../../../scripts/seed-guard.js';

describe('parseSeedTarget', () => {
  it.each([
    ['postgresql://forge:forge@localhost:5432/forge', 'localhost'],
    ['postgresql://forge:forge@127.0.0.1:5432/forge', '127.0.0.1'],
    ['postgresql://forge:forge@host.docker.internal:5432/forge', 'host.docker.internal'],
    ['postgresql://forge:forge@db.example.com:5432/forge', 'db.example.com'],
  ])('extracts host from %s', (url, expectedHost) => {
    expect(parseSeedTarget(url)).toBe(expectedHost);
  });

  it('strips IPv6 brackets so [::1] returns "::1"', () => {
    expect(parseSeedTarget('postgresql://forge:forge@[::1]:5432/forge')).toBe('::1');
  });

  it('throws when DATABASE_URL is undefined', () => {
    expect(() => parseSeedTarget(undefined)).toThrow(/DATABASE_URL/);
  });

  it('throws when DATABASE_URL is malformed', () => {
    expect(() => parseSeedTarget('not a url')).toThrow(/Invalid DATABASE_URL/);
  });
});

describe('assertSeedAllowed', () => {
  it.each([['localhost'], ['127.0.0.1'], ['::1'], ['host.docker.internal']])(
    'does not throw for safe host %s',
    (host) => {
      expect(() => assertSeedAllowed(host, undefined)).not.toThrow();
    },
  );

  it('throws for unsafe host without override', () => {
    expect(() => assertSeedAllowed('db.example.com', undefined)).toThrow(/refusing/i);
  });

  it('does not throw for unsafe host when override is "1"', () => {
    expect(() => assertSeedAllowed('db.example.com', '1')).not.toThrow();
  });

  it('throws for unsafe host when override is a non-"1" truthy string', () => {
    expect(() => assertSeedAllowed('db.example.com', 'true')).toThrow(/refusing/i);
  });
});
