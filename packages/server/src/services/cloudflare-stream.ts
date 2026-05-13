/**
 * CloudflareStreamService — wrapper around the Cloudflare Stream REST API,
 * the captions WebVTT download (with SSRF defenses), and RS256 playback-token
 * signing via `jose`.
 *
 * The class is exported under two names:
 *   - `CloudflareStreamService` — the public constructor most call sites use.
 *   - `CloudflareStreamServiceImpl` — the same class, exported as an internal
 *     alias so the factory and other modules can disambiguate from the Mock.
 *
 * Both `httpClient` and `jwtSigner` are injected so unit tests can stub
 * upstream behaviour without crossing the network or computing real RSA
 * signatures.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertCfEnv } from '../lib/cf-stream-config.js';

export interface CloudflareStreamConfig {
  accountId: string;
  apiToken: string;
  signingKeyId: string;
  signingKeyPem: string;
  customerSubdomain: string;
  httpClient?: typeof fetch;
  jwtSigner?: JwtSigner;
}

export type JwtSigner = (
  claims: Record<string, unknown>,
  keyId: string,
  pem: string,
) => Promise<string>;

export interface UploadUrlRequest {
  maxDurationSeconds: number;
  maxSizeBytes: number;
  requireSignedURLs: boolean;
}

export interface VideoStatusResult {
  readyToStream: boolean;
  state: string;
  durationSec: number | null;
  sizeBytes: number | null;
  requireSignedURLs: boolean;
}

/** Public contract every CloudflareStream* class implements. */
export interface ICloudflareStreamService {
  /** Used by WU5 route handlers to assemble CF playback URLs. */
  readonly customerSubdomain: string;

  requestUploadUrl(req: UploadUrlRequest): Promise<{ uploadUrl: string; cfUid: string }>;
  getVideoStatus(cfUid: string): Promise<VideoStatusResult | null>;
  requestCaptions(cfUid: string): Promise<void>;
  fetchCaptionsWebVTT(url: string): Promise<string>;
  setRequireSignedUrls(cfUid: string, value: boolean): Promise<void>;
  mintPlaybackToken(cfUid: string): Promise<string>;
  purgeCache(cfUid: string): Promise<void>;
  deleteAsset(cfUid: string): Promise<void>;
}

const ALLOWED_VTT_HOSTS = [/^videodelivery\.net$/, /^customer-[a-z0-9-]+\.cloudflarestream\.com$/];

const MAX_VTT_BYTES = 4 * 1024 * 1024; // 4 MB cap
const VTT_FETCH_TIMEOUT_MS = 30_000;

export class CloudflareStreamServiceImpl implements ICloudflareStreamService {
  private readonly http: typeof fetch;
  // Exposed to WU5 route handlers that need to construct CF playback URLs
  // (e.g. `https://customer-<subdomain>.cloudflarestream.com/<cfUid>/manifest/video.m3u8`).
  public readonly customerSubdomain: string;

  constructor(private readonly cfg: CloudflareStreamConfig) {
    this.http = cfg.httpClient ?? globalThis.fetch.bind(globalThis);
    this.customerSubdomain = cfg.customerSubdomain;
  }

  private baseUrl(): string {
    return `https://api.cloudflare.com/client/v4/accounts/${this.cfg.accountId}`;
  }

  private authHeader(): { authorization: string } {
    return { authorization: `bearer ${this.cfg.apiToken}` };
  }

  async requestUploadUrl(req: UploadUrlRequest): Promise<{ uploadUrl: string; cfUid: string }> {
    const metadataParts = [
      `name ${Buffer.from('upload').toString('base64')}`,
      `maxDurationSeconds ${Buffer.from(String(req.maxDurationSeconds)).toString('base64')}`,
    ];
    if (req.requireSignedURLs) {
      metadataParts.push(`requiresignedurls ${Buffer.from('true').toString('base64')}`);
    }
    const res = await this.http(`${this.baseUrl()}/stream`, {
      method: 'POST',
      headers: {
        ...this.authHeader(),
        'tus-resumable': '1.0.0',
        'upload-length': String(req.maxSizeBytes),
        'upload-metadata': metadataParts.join(','),
      },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: requestUploadUrl ${res.status}`);
    }
    const uploadUrl = res.headers.get('location');
    const cfUid = res.headers.get('stream-media-id');
    if (!uploadUrl || !cfUid) {
      throw new Error('CF response missing upload url or stream-media-id');
    }
    return { uploadUrl, cfUid };
  }

  async getVideoStatus(cfUid: string): Promise<VideoStatusResult | null> {
    const res = await this.http(`${this.baseUrl()}/stream/${cfUid}`, {
      headers: { ...this.authHeader() },
    });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: getVideoStatus ${res.status}`);
    }
    const body = (await res.json()) as {
      result: {
        readyToStream: boolean;
        status: { state: string };
        duration?: number;
        size?: number;
        requireSignedURLs?: boolean;
      };
    };
    return {
      readyToStream: body.result.readyToStream,
      state: body.result.status.state,
      durationSec: body.result.duration ?? null,
      sizeBytes: body.result.size ?? null,
      requireSignedURLs: body.result.requireSignedURLs ?? false,
    };
  }

  async requestCaptions(cfUid: string): Promise<void> {
    const res = await this.http(`${this.baseUrl()}/stream/${cfUid}/captions/en`, {
      method: 'POST',
      headers: { ...this.authHeader() },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: requestCaptions ${res.status}`);
    }
  }

  async fetchCaptionsWebVTT(url: string): Promise<string> {
    const u = new URL(url);
    if (!ALLOWED_VTT_HOSTS.some((re) => re.test(u.hostname))) {
      throw new Error(`vtt host not in allowlist: ${u.hostname}`);
    }
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), VTT_FETCH_TIMEOUT_MS);
    try {
      const res = await this.http(url, { redirect: 'error', signal: ac.signal });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`CF_UPSTREAM_ERROR: fetchCaptionsWebVTT ${res.status}`);
      }
      // Pre-buffer DoS guard: reject when the server honestly declares an
      // oversized body before we await `res.text()`. The post-buffer check
      // below remains as a defense for chunked/no-content-length responses.
      const declared = res.headers.get('content-length');
      if (declared != null && Number(declared) > MAX_VTT_BYTES) {
        throw new Error('webvtt body too large');
      }
      const text = await res.text();
      if (text.length > MAX_VTT_BYTES) {
        throw new Error('webvtt body too large');
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  async setRequireSignedUrls(cfUid: string, value: boolean): Promise<void> {
    const res = await this.http(`${this.baseUrl()}/stream/${cfUid}`, {
      method: 'POST',
      headers: {
        ...this.authHeader(),
        'content-type': 'application/json',
      },
      body: JSON.stringify({ requireSignedURLs: value }),
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: setRequireSignedUrls ${res.status}`);
    }
  }

  async mintPlaybackToken(cfUid: string): Promise<string> {
    const claims = {
      sub: cfUid,
      kid: this.cfg.signingKeyId,
      exp: Math.floor(Date.now() / 1000) + 3600,
      accessRules: [{ type: 'any', action: 'allow' }],
    };
    if (!this.cfg.jwtSigner) {
      throw new Error('jwtSigner not configured');
    }
    return this.cfg.jwtSigner(claims, this.cfg.signingKeyId, this.cfg.signingKeyPem);
  }

  async purgeCache(cfUid: string): Promise<void> {
    const res = await this.http(`${this.baseUrl()}/stream/${cfUid}/purge`, {
      method: 'POST',
      headers: { ...this.authHeader() },
    });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: purgeCache ${res.status}`);
    }
  }

  async deleteAsset(cfUid: string): Promise<void> {
    const res = await this.http(`${this.baseUrl()}/stream/${cfUid}`, {
      method: 'DELETE',
      headers: { ...this.authHeader() },
    });
    if (res.status === 404) return;
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`CF_UPSTREAM_ERROR: deleteAsset ${res.status}`);
    }
  }
}

// Public alias — the spec refers to the class as `CloudflareStreamService`.
export { CloudflareStreamServiceImpl as CloudflareStreamService };

/* ---------------------------------------------------------------------- */
/* Mock implementation                                                    */
/* ---------------------------------------------------------------------- */

interface MockAsset {
  requireSignedURLs: boolean;
  sizeBytes: number;
  durationSec: number;
}

export interface MockLifecycleEvent {
  type: 'video.ready' | 'captions.ready';
  cfUid: string;
  durationSec?: number;
  sizeBytes?: number;
}

export interface MockLifecycleHandler {
  handleWebhook(event: MockLifecycleEvent): Promise<void>;
}

const __filenameForFixture = fileURLToPath(import.meta.url);
const __dirnameForFixture = dirname(__filenameForFixture);
// services/ -> src/ -> packages/server/ -> packages/ -> repo root -> e2e/fixtures/
const SAMPLE_CAPTIONS_PATH = join(
  __dirnameForFixture,
  '..',
  '..',
  '..',
  '..',
  'e2e',
  'fixtures',
  'sample-captions.vtt',
);

export class MockCloudflareStreamService implements ICloudflareStreamService {
  private readonly assets = new Map<string, MockAsset>();
  public readonly purgeCalls: string[] = [];
  public readonly customerSubdomain = 'mock-subdomain';
  private counter = 0;

  async requestUploadUrl(req: UploadUrlRequest): Promise<{ uploadUrl: string; cfUid: string }> {
    this.counter += 1;
    const cfUid = `cf_mock_${this.counter}`;
    this.assets.set(cfUid, {
      requireSignedURLs: req.requireSignedURLs,
      sizeBytes: req.maxSizeBytes,
      durationSec: req.maxDurationSeconds,
    });
    return { uploadUrl: `https://mock.cf.local/${cfUid}`, cfUid };
  }

  async getVideoStatus(cfUid: string): Promise<VideoStatusResult | null> {
    const a = this.assets.get(cfUid);
    if (!a) return null;
    return {
      readyToStream: true,
      state: 'ready',
      durationSec: a.durationSec,
      sizeBytes: a.sizeBytes,
      requireSignedURLs: a.requireSignedURLs,
    };
  }

  async requestCaptions(_cfUid: string): Promise<void> {
    // no-op for mock; simulateLifecycle drives the captions.ready event
  }

  async fetchCaptionsWebVTT(_url: string): Promise<string> {
    return readFileSync(SAMPLE_CAPTIONS_PATH, 'utf8');
  }

  async setRequireSignedUrls(cfUid: string, value: boolean): Promise<void> {
    const a = this.assets.get(cfUid);
    if (a) a.requireSignedURLs = value;
  }

  async mintPlaybackToken(cfUid: string): Promise<string> {
    return `tok_${cfUid}`;
  }

  async purgeCache(cfUid: string): Promise<void> {
    this.purgeCalls.push(cfUid);
  }

  async deleteAsset(cfUid: string): Promise<void> {
    this.assets.delete(cfUid);
  }

  /**
   * Test helper — synthesise the `video.ready` and `captions.ready` webhook
   * events for the given cfUid by invoking the provided handler. Used by E2E
   * specs (and by WU3+ unit tests) to drive the pipeline state machine
   * deterministically without round-tripping through real CF Stream.
   */
  async simulateLifecycle(cfUid: string, opts: { handler: MockLifecycleHandler }): Promise<void> {
    await opts.handler.handleWebhook({
      type: 'video.ready',
      cfUid,
      durationSec: 12,
      sizeBytes: 1024,
    });
    await opts.handler.handleWebhook({ type: 'captions.ready', cfUid });
  }
}

/* ---------------------------------------------------------------------- */
/* Factory                                                                */
/* ---------------------------------------------------------------------- */

type CfEnv = NodeJS.ProcessEnv | Record<string, string | undefined>;

/**
 * Real production JWT signer using `jose`'s RS256. The PKCS8 PEM is parsed
 * lazily on first use and cached per-PEM so subsequent signs are cheap.
 *
 * Exposed as a named export so the factory's unit test can exercise the
 * happy path with a real generated key pair without standing up CF creds.
 */
export function makeProdJwtSigner(): JwtSigner {
  const importedKeyByPem = new Map<string, Promise<unknown>>();
  return async (claims, keyId, pem) => {
    const { SignJWT, importPKCS8 } = await import('jose');
    let keyP = importedKeyByPem.get(pem);
    if (!keyP) {
      keyP = importPKCS8(pem, 'RS256');
      importedKeyByPem.set(pem, keyP);
    }
    const key = await keyP;
    return new SignJWT(claims)
      .setProtectedHeader({ alg: 'RS256', kid: keyId })
      .setExpirationTime(claims.exp as number)
      .setSubject(claims.sub as string)
      .sign(key as Parameters<typeof SignJWT.prototype.sign>[0]);
  };
}

function buildRealFromEnv(env: CfEnv): CloudflareStreamServiceImpl {
  return new CloudflareStreamServiceImpl({
    accountId: env.CF_ACCOUNT_ID as string,
    apiToken: env.CF_STREAM_API_TOKEN as string,
    signingKeyId: env.CF_STREAM_SIGNING_KEY_ID as string,
    signingKeyPem: env.CF_STREAM_SIGNING_KEY_PEM as string,
    customerSubdomain: env.CF_STREAM_CUSTOMER_SUBDOMAIN as string,
    jwtSigner: makeProdJwtSigner(),
  });
}

/**
 * Factory selecting real vs mock service per spec §10:
 *   - production: assertCfEnv() enforces all CF_* vars; MOCK_CF_STREAM=1 is rejected.
 *   - test: always Mock.
 *   - development:
 *       - MOCK_CF_STREAM=1 forces Mock (even with real CF_* set, for local testing).
 *       - CF_ACCOUNT_ID unset => Mock (so a fresh checkout works without secrets).
 *       - otherwise real impl.
 */
export function createCloudflareStream(
  env: CfEnv,
): CloudflareStreamServiceImpl | MockCloudflareStreamService {
  assertCfEnv(env);
  if (env.NODE_ENV === 'test') return new MockCloudflareStreamService();
  if (env.NODE_ENV === 'production') return buildRealFromEnv(env);
  if (env.MOCK_CF_STREAM === '1' || !env.CF_ACCOUNT_ID) {
    return new MockCloudflareStreamService();
  }
  return buildRealFromEnv(env);
}
