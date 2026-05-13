import { describe, it, expect, vi } from 'vitest';
import { CloudflareStreamService } from '../../services/cloudflare-stream.js';

function makeService(
  httpClient: typeof fetch,
  jwtSigner: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue('TOK'),
) {
  return new CloudflareStreamService({
    accountId: 'acct',
    apiToken: 'tok',
    signingKeyId: 'kid',
    signingKeyPem: 'PEM',
    customerSubdomain: 'customer-xyz',
    httpClient,
    jwtSigner,
  });
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('CloudflareStreamService.requestUploadUrl', () => {
  it('posts with bearer + tus headers and returns uploadUrl + cfUid', async () => {
    const http = vi.fn().mockResolvedValue(
      new Response('', {
        status: 200,
        headers: {
          location: 'https://upload.cf/abc',
          'stream-media-id': 'cfuid123',
        },
      }),
    );
    const svc = makeService(http);
    const r = await svc.requestUploadUrl({
      maxDurationSeconds: 7200,
      maxSizeBytes: 10485760,
      requireSignedURLs: false,
    });
    expect(r).toEqual({ uploadUrl: 'https://upload.cf/abc', cfUid: 'cfuid123' });
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining('/accounts/acct/stream'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'bearer tok',
          'tus-resumable': '1.0.0',
        }),
      }),
    );
  });

  it('includes requiresignedurls metadata when requireSignedURLs=true', async () => {
    const http = vi.fn().mockResolvedValue(
      new Response('', {
        status: 200,
        headers: { location: 'https://x', 'stream-media-id': 'cfu' },
      }),
    );
    await makeService(http).requestUploadUrl({
      maxDurationSeconds: 60,
      maxSizeBytes: 1024,
      requireSignedURLs: true,
    });
    const opts = http.mock.calls[0][1] as RequestInit;
    const headers = opts.headers as Record<string, string>;
    expect(headers['upload-metadata']).toContain('requiresignedurls');
  });

  it('throws on non-2xx', async () => {
    const http = vi.fn().mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(
      makeService(http).requestUploadUrl({
        maxDurationSeconds: 1,
        maxSizeBytes: 1,
        requireSignedURLs: false,
      }),
    ).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });

  it('throws when location header is missing', async () => {
    const http = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200, headers: { 'stream-media-id': 'x' } }));
    await expect(
      makeService(http).requestUploadUrl({
        maxDurationSeconds: 1,
        maxSizeBytes: 1,
        requireSignedURLs: false,
      }),
    ).rejects.toThrow(/upload url/i);
  });

  it('throws when stream-media-id header is missing', async () => {
    const http = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 200, headers: { location: 'https://x' } }));
    await expect(
      makeService(http).requestUploadUrl({
        maxDurationSeconds: 1,
        maxSizeBytes: 1,
        requireSignedURLs: false,
      }),
    ).rejects.toThrow(/upload url|stream-media-id/i);
  });
});

describe('CloudflareStreamService.getVideoStatus', () => {
  it('returns CF status payload', async () => {
    const http = vi.fn().mockResolvedValue(
      jsonRes({
        result: {
          uid: 'u',
          readyToStream: true,
          status: { state: 'ready' },
          duration: 12,
          size: 2048,
          requireSignedURLs: true,
        },
      }),
    );
    const r = await makeService(http).getVideoStatus('u');
    expect(r).toEqual({
      readyToStream: true,
      state: 'ready',
      durationSec: 12,
      sizeBytes: 2048,
      requireSignedURLs: true,
    });
  });

  it('defaults duration/size to null and requireSignedURLs to false when absent', async () => {
    const http = vi.fn().mockResolvedValue(
      jsonRes({
        result: { uid: 'u', readyToStream: false, status: { state: 'queued' } },
      }),
    );
    const r = await makeService(http).getVideoStatus('u');
    expect(r).toEqual({
      readyToStream: false,
      state: 'queued',
      durationSec: null,
      sizeBytes: null,
      requireSignedURLs: false,
    });
  });

  it('returns null on 404', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const r = await makeService(http).getVideoStatus('missing');
    expect(r).toBeNull();
  });

  it('throws on 500', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(makeService(http).getVideoStatus('u')).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });
});

describe('CloudflareStreamService.requestCaptions', () => {
  it('POSTs to /captions/en', async () => {
    const http = vi.fn().mockResolvedValue(jsonRes({ success: true }));
    await makeService(http).requestCaptions('u');
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining('/stream/u/captions/en'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-2xx', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(makeService(http).requestCaptions('u')).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });
});

describe('CloudflareStreamService.fetchCaptionsWebVTT', () => {
  it('returns vtt text from videodelivery.net', async () => {
    const http = vi.fn().mockResolvedValue(new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nhi'));
    const r = await makeService(http).fetchCaptionsWebVTT(
      'https://videodelivery.net/u/captions/en',
    );
    expect(r).toMatch(/^WEBVTT/);
  });

  it('returns vtt text from customer-*.cloudflarestream.com', async () => {
    const http = vi.fn().mockResolvedValue(new Response('WEBVTT\n\n00:00.000 --> 00:01.000\nhi'));
    const r = await makeService(http).fetchCaptionsWebVTT(
      'https://customer-xyz.cloudflarestream.com/u/captions/en',
    );
    expect(r).toMatch(/^WEBVTT/);
    // assert SSRF defenses are wired into the request
    const opts = http.mock.calls[0][1] as RequestInit;
    expect(opts.redirect).toBe('error');
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects URLs outside allowlist (SSRF defense)', async () => {
    const http = vi.fn();
    await expect(
      makeService(http).fetchCaptionsWebVTT('https://evil.example.com/x'),
    ).rejects.toThrow(/allowlist/i);
    expect(http).not.toHaveBeenCalled();
  });

  it('rejects hostnames that look-alike but do not match the allowlist regex', async () => {
    const http = vi.fn();
    await expect(
      makeService(http).fetchCaptionsWebVTT('https://videodelivery.net.evil.com/x'),
    ).rejects.toThrow(/allowlist/i);
    expect(http).not.toHaveBeenCalled();
  });

  it('rejects bodies > 4MB', async () => {
    const huge = 'x'.repeat(4 * 1024 * 1024 + 1);
    const http = vi.fn().mockResolvedValue(new Response(huge));
    await expect(
      makeService(http).fetchCaptionsWebVTT('https://videodelivery.net/u/captions/en'),
    ).rejects.toThrow(/too large/i);
  });

  it('throws on non-2xx response', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    await expect(
      makeService(http).fetchCaptionsWebVTT('https://videodelivery.net/u/captions/en'),
    ).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });
});

describe('CloudflareStreamService.setRequireSignedUrls', () => {
  it('POSTs the new value', async () => {
    const http = vi.fn().mockResolvedValue(jsonRes({ success: true }));
    await makeService(http).setRequireSignedUrls('u', true);
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining('/stream/u'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ requireSignedURLs: true }),
      }),
    );
  });

  it('throws on non-2xx', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 502 }));
    await expect(makeService(http).setRequireSignedUrls('u', true)).rejects.toThrow(
      /CF_UPSTREAM_ERROR/,
    );
  });
});

describe('CloudflareStreamService.mintPlaybackToken', () => {
  it('calls jwtSigner with the right claims', async () => {
    const signer = vi.fn().mockResolvedValue('JWT');
    const svc = makeService(vi.fn(), signer);
    const tok = await svc.mintPlaybackToken('cfuid');
    expect(tok).toBe('JWT');
    const [claims, kid, pem] = signer.mock.calls[0];
    expect(claims).toMatchObject({ sub: 'cfuid', kid: 'kid' });
    expect(typeof claims.exp).toBe('number');
    expect(claims.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(claims.accessRules).toEqual([{ type: 'any', action: 'allow' }]);
    expect(kid).toBe('kid');
    expect(pem).toBe('PEM');
  });

  it('throws when no jwtSigner is configured', async () => {
    const svc = new CloudflareStreamService({
      accountId: 'a',
      apiToken: 't',
      signingKeyId: 'k',
      signingKeyPem: 'p',
      customerSubdomain: 'c',
      httpClient: vi.fn(),
    });
    await expect(svc.mintPlaybackToken('x')).rejects.toThrow(/jwtSigner/);
  });
});

describe('CloudflareStreamService.purgeCache', () => {
  it('POSTs the purge endpoint', async () => {
    const http = vi.fn().mockResolvedValue(jsonRes({ success: true }));
    await makeService(http).purgeCache('u');
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining('/stream/u/purge'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-2xx', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(makeService(http).purgeCache('u')).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });
});

describe('CloudflareStreamService.deleteAsset', () => {
  it('DELETEs the asset', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 200 }));
    await makeService(http).deleteAsset('u');
    expect(http).toHaveBeenCalledWith(
      expect.stringContaining('/stream/u'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('is idempotent on 404', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    await expect(makeService(http).deleteAsset('u')).resolves.toBeUndefined();
  });

  it('throws on 500', async () => {
    const http = vi.fn().mockResolvedValue(new Response('', { status: 500 }));
    await expect(makeService(http).deleteAsset('u')).rejects.toThrow(/CF_UPSTREAM_ERROR/);
  });
});

describe('CloudflareStreamService default httpClient', () => {
  it('falls back to globalThis.fetch when httpClient is not provided', async () => {
    const orig = globalThis.fetch;
    const stub = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    globalThis.fetch = stub as unknown as typeof fetch;
    try {
      const svc = new CloudflareStreamService({
        accountId: 'a',
        apiToken: 't',
        signingKeyId: 'k',
        signingKeyPem: 'p',
        customerSubdomain: 'c',
      });
      const r = await svc.getVideoStatus('missing');
      expect(r).toBeNull();
      expect(stub).toHaveBeenCalled();
    } finally {
      globalThis.fetch = orig;
    }
  });
});
