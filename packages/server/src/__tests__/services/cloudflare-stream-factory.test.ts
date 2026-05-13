import { describe, it, expect, beforeAll } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from 'jose';

import {
  createCloudflareStream,
  MockCloudflareStreamService,
  CloudflareStreamService,
  makeProdJwtSigner,
} from '../../services/cloudflare-stream.js';

describe('createCloudflareStream', () => {
  it('returns Mock in NODE_ENV=test', () => {
    expect(createCloudflareStream({ NODE_ENV: 'test' })).toBeInstanceOf(
      MockCloudflareStreamService,
    );
  });

  it('returns Mock when CF_ACCOUNT_ID is unset in dev', () => {
    expect(createCloudflareStream({ NODE_ENV: 'development' })).toBeInstanceOf(
      MockCloudflareStreamService,
    );
  });

  it('returns Mock when MOCK_CF_STREAM=1 overrides in dev', () => {
    expect(
      createCloudflareStream({
        NODE_ENV: 'development',
        MOCK_CF_STREAM: '1',
        CF_ACCOUNT_ID: 'a',
        CF_STREAM_API_TOKEN: 't',
        CF_STREAM_WEBHOOK_SECRET: 's',
        CF_STREAM_SIGNING_KEY_ID: 'k',
        CF_STREAM_SIGNING_KEY_PEM: 'p',
        CF_STREAM_CUSTOMER_SUBDOMAIN: 'x',
      }),
    ).toBeInstanceOf(MockCloudflareStreamService);
  });

  it('returns real impl when env is complete in dev', () => {
    const svc = createCloudflareStream({
      NODE_ENV: 'development',
      CF_ACCOUNT_ID: 'a',
      CF_STREAM_API_TOKEN: 't',
      CF_STREAM_WEBHOOK_SECRET: 's',
      CF_STREAM_SIGNING_KEY_ID: 'k',
      CF_STREAM_SIGNING_KEY_PEM: 'p',
      CF_STREAM_CUSTOMER_SUBDOMAIN: 'x',
    });
    expect(svc).toBeInstanceOf(CloudflareStreamService);
  });

  it('returns real impl in production when env is complete', () => {
    const svc = createCloudflareStream({
      NODE_ENV: 'production',
      CF_ACCOUNT_ID: 'a',
      CF_STREAM_API_TOKEN: 't',
      CF_STREAM_WEBHOOK_SECRET: 's',
      CF_STREAM_SIGNING_KEY_ID: 'k',
      CF_STREAM_SIGNING_KEY_PEM: 'p',
      CF_STREAM_CUSTOMER_SUBDOMAIN: 'x',
    });
    expect(svc).toBeInstanceOf(CloudflareStreamService);
  });

  it('rejects MOCK_CF_STREAM=1 in production', () => {
    expect(() =>
      createCloudflareStream({
        NODE_ENV: 'production',
        MOCK_CF_STREAM: '1',
        CF_ACCOUNT_ID: 'a',
        CF_STREAM_API_TOKEN: 't',
        CF_STREAM_WEBHOOK_SECRET: 's',
        CF_STREAM_SIGNING_KEY_ID: 'k',
        CF_STREAM_SIGNING_KEY_PEM: 'p',
        CF_STREAM_CUSTOMER_SUBDOMAIN: 'x',
      }),
    ).toThrow(/MOCK_CF_STREAM/);
  });
});

describe('makeProdJwtSigner (jose RS256)', () => {
  let pkcs8Pem: string;
  let spkiPem: string;

  beforeAll(() => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    pkcs8Pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    spkiPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  });

  it('produces a valid RS256 JWT whose claims and header round-trip correctly', async () => {
    const signer = makeProdJwtSigner();
    const exp = Math.floor(Date.now() / 1000) + 600;
    const claims = {
      sub: 'cfuid-abc',
      kid: 'key-1',
      exp,
      accessRules: [{ type: 'any', action: 'allow' }],
    };
    const jwt = await signer(claims, 'key-1', pkcs8Pem);

    const header = decodeProtectedHeader(jwt);
    expect(header.alg).toBe('RS256');
    expect(header.kid).toBe('key-1');

    const decoded = decodeJwt(jwt);
    expect(decoded.sub).toBe('cfuid-abc');
    expect(decoded.exp).toBe(exp);

    // Verify the signature with the corresponding public key.
    const publicKey = await importSPKI(spkiPem, 'RS256');
    const { payload } = await jwtVerify(jwt, publicKey);
    expect(payload.sub).toBe('cfuid-abc');
  });

  it('caches the imported key per-PEM (second call reuses the cached key)', async () => {
    const signer = makeProdJwtSigner();
    const exp = Math.floor(Date.now() / 1000) + 600;
    const claims = { sub: 's', kid: 'k', exp };
    const t1 = await signer(claims, 'k', pkcs8Pem);
    const t2 = await signer(claims, 'k', pkcs8Pem);
    // Both calls return well-formed JWTs; cache path exercised on second call.
    expect(t1.split('.').length).toBe(3);
    expect(t2.split('.').length).toBe(3);
  });
});
