import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ---------- mocks (hoisted) ----------

const mockResolve4 = vi.fn<(hostname: string) => Promise<string[]>>();
const mockResolve6 = vi.fn<(hostname: string) => Promise<string[]>>();

vi.mock('node:dns/promises', () => ({
  default: {
    resolve4: (...args: Parameters<typeof mockResolve4>) => mockResolve4(...args),
    resolve6: (...args: Parameters<typeof mockResolve6>) => mockResolve6(...args),
  },
  resolve4: (...args: Parameters<typeof mockResolve4>) => mockResolve4(...args),
  resolve6: (...args: Parameters<typeof mockResolve6>) => mockResolve6(...args),
}));

const mockFetch = vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>();
vi.stubGlobal('fetch', mockFetch);

import {
  validateUrl,
  isIpBlocked,
  parseOpenGraph,
  fetchLinkPreview,
} from '../../services/link-preview.js';

// ---------- helpers ----------

function htmlPage(head: string, body = ''): string {
  return `<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;
}

function okResponse(html: string, headers: Record<string, string> = {}): Response {
  return new Response(html, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', ...headers },
  });
}

function redirectResponse(location: string, status = 301): Response {
  return new Response(null, { status, headers: { location } });
}

/**
 * Type-narrowing guard that fails the test if value is null/undefined,
 * and returns the narrowed non-null value for subsequent assertions.
 */
function assertDefined<T>(value: T | null | undefined): T {
  expect(value).not.toBeNull();
  return value as T;
}

// ---------- tests ----------

describe('link-preview service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // default: DNS resolves to a public IP
    mockResolve4.mockResolvedValue(['93.184.216.34']);
    mockResolve6.mockRejectedValue(new Error('no AAAA'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================
  // validateUrl
  // =========================================================
  describe('validateUrl', () => {
    it('should accept a valid https URL', () => {
      const result = assertDefined(validateUrl('https://example.com/page'));
      expect(result.protocol).toBe('https:');
      expect(result.hostname).toBe('example.com');
    });

    it('should reject an http URL', () => {
      expect(validateUrl('http://example.com')).toBeNull();
    });

    it('should reject an ftp URL', () => {
      expect(validateUrl('ftp://example.com')).toBeNull();
    });

    it('should reject a file URL', () => {
      expect(validateUrl('file:///etc/passwd')).toBeNull();
    });

    it('should reject an empty string', () => {
      expect(validateUrl('')).toBeNull();
    });

    it('should reject an invalid URL', () => {
      expect(validateUrl('not-a-url')).toBeNull();
    });

    it('should return a parsed URL object', () => {
      const result = assertDefined(validateUrl('https://example.com/path?q=1'));
      expect(result).toBeInstanceOf(URL);
      expect(result.pathname).toBe('/path');
      expect(result.search).toBe('?q=1');
    });
  });

  // =========================================================
  // isIpBlocked
  // =========================================================
  describe('isIpBlocked', () => {
    // IPv4 blocked ranges
    it('should block 127.0.0.1 (loopback)', () => {
      expect(isIpBlocked('127.0.0.1')).toBe(true);
    });

    it('should block 127.255.255.255 (loopback upper bound)', () => {
      expect(isIpBlocked('127.255.255.255')).toBe(true);
    });

    it('should block 10.0.0.1 (private class A)', () => {
      expect(isIpBlocked('10.0.0.1')).toBe(true);
    });

    it('should block 10.255.255.255 (private class A upper)', () => {
      expect(isIpBlocked('10.255.255.255')).toBe(true);
    });

    it('should block 172.16.0.1 (private class B)', () => {
      expect(isIpBlocked('172.16.0.1')).toBe(true);
    });

    it('should block 172.31.255.255 (private class B upper)', () => {
      expect(isIpBlocked('172.31.255.255')).toBe(true);
    });

    it('should block 192.168.0.1 (private class C)', () => {
      expect(isIpBlocked('192.168.0.1')).toBe(true);
    });

    it('should block 192.168.255.255 (private class C upper)', () => {
      expect(isIpBlocked('192.168.255.255')).toBe(true);
    });

    it('should block 169.254.1.1 (link-local)', () => {
      expect(isIpBlocked('169.254.1.1')).toBe(true);
    });

    it('should block 0.0.0.0 (unspecified)', () => {
      expect(isIpBlocked('0.0.0.0')).toBe(true);
    });

    it('should block 0.255.255.255 (0.x range upper)', () => {
      expect(isIpBlocked('0.255.255.255')).toBe(true);
    });

    it('should block 100.64.0.1 (shared address space / CGNAT)', () => {
      expect(isIpBlocked('100.64.0.1')).toBe(true);
    });

    it('should block 100.127.255.255 (CGNAT upper bound)', () => {
      expect(isIpBlocked('100.127.255.255')).toBe(true);
    });

    it('should block 192.0.0.1 (IETF protocol assignments)', () => {
      expect(isIpBlocked('192.0.0.1')).toBe(true);
    });

    it('should block 192.0.0.255 (IETF protocol assignments upper)', () => {
      expect(isIpBlocked('192.0.0.255')).toBe(true);
    });

    // IPv6 blocked ranges
    it('should block ::1 (IPv6 loopback)', () => {
      expect(isIpBlocked('::1')).toBe(true);
    });

    it('should block fc00::1 (IPv6 unique local)', () => {
      expect(isIpBlocked('fc00::1')).toBe(true);
    });

    it('should block fd00::1 (IPv6 unique local fd range)', () => {
      expect(isIpBlocked('fd00::1')).toBe(true);
    });

    it('should block fe80::1 (IPv6 link-local)', () => {
      expect(isIpBlocked('fe80::1')).toBe(true);
    });

    // Allowed public IPs
    it('should allow 8.8.8.8 (Google DNS)', () => {
      expect(isIpBlocked('8.8.8.8')).toBe(false);
    });

    it('should allow 172.32.0.1 (just outside private class B)', () => {
      expect(isIpBlocked('172.32.0.1')).toBe(false);
    });

    it('should allow 2606:4700::1 (Cloudflare public IPv6)', () => {
      expect(isIpBlocked('2606:4700::1')).toBe(false);
    });

    it('should allow 93.184.216.34 (example.com)', () => {
      expect(isIpBlocked('93.184.216.34')).toBe(false);
    });

    it('should allow 100.128.0.0 (just outside CGNAT)', () => {
      expect(isIpBlocked('100.128.0.0')).toBe(false);
    });
  });

  // =========================================================
  // parseOpenGraph
  // =========================================================
  describe('parseOpenGraph', () => {
    it('should extract OG title, description, and image', () => {
      const html = htmlPage(
        `<meta property="og:title" content="My Title">
         <meta property="og:description" content="My Description">
         <meta property="og:image" content="https://img.example.com/pic.jpg">`,
        '<p>Some body text here for reading time</p>',
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.title).toBe('My Title');
      expect(result.description).toBe('My Description');
      expect(result.image).toBe('https://img.example.com/pic.jpg');
    });

    it('should fall back to <title> when og:title is missing', () => {
      const html = htmlPage(
        `<title>Fallback Title</title>
         <meta property="og:description" content="Desc">`,
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.title).toBe('Fallback Title');
    });

    it('should fall back to meta[name="description"] when og:description is missing', () => {
      const html = htmlPage(
        `<meta property="og:title" content="Title">
         <meta name="description" content="Fallback Desc">`,
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.description).toBe('Fallback Desc');
    });

    it('should return null when no title is found at all', () => {
      const html = htmlPage(
        '<meta property="og:description" content="No title page">',
      );

      expect(parseOpenGraph(html)).toBeNull();
    });

    it('should set image to null when og:image is not https', () => {
      const html = htmlPage(
        `<meta property="og:title" content="Title">
         <meta property="og:description" content="Desc">
         <meta property="og:image" content="http://img.example.com/pic.jpg">`,
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.image).toBeNull();
    });

    it('should set image to null when og:image is missing', () => {
      const html = htmlPage(
        `<meta property="og:title" content="Title">
         <meta property="og:description" content="Desc">`,
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.image).toBeNull();
    });

    it('should calculate reading time as ceil(words / 200), 600 words = 3 min', () => {
      const words = Array(600).fill('word').join(' ');
      const html = htmlPage(
        `<meta property="og:title" content="Title">
         <meta property="og:description" content="Desc">`,
        `<p>${words}</p>`,
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.readingTime).toBe(3);
    });

    it('should set reading time to minimum 1 for short content', () => {
      const html = htmlPage(
        `<meta property="og:title" content="Title">
         <meta property="og:description" content="Desc">`,
        '<p>Short</p>',
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.readingTime).toBe(1);
    });

    it('should set description to empty string when neither og:description nor meta description exists', () => {
      const html = htmlPage(
        '<meta property="og:title" content="Title">',
      );

      const result = assertDefined(parseOpenGraph(html));
      expect(result.description).toBe('');
    });
  });

  // =========================================================
  // fetchLinkPreview
  // =========================================================
  describe('fetchLinkPreview', () => {
    it('should return a full LinkPreview for a valid page', async () => {
      const html = htmlPage(
        `<meta property="og:title" content="Example">
         <meta property="og:description" content="A page">
         <meta property="og:image" content="https://img.example.com/og.png">`,
        '<p>' + Array(400).fill('word').join(' ') + '</p>',
      );
      mockFetch.mockResolvedValueOnce(okResponse(html));

      const result = assertDefined(await fetchLinkPreview('https://example.com'));
      expect(result.title).toBe('Example');
      expect(result.description).toBe('A page');
      expect(result.image).toBe('https://img.example.com/og.png');
      expect(result.readingTime).toBe(2);
    });

    it('should return null for a non-https URL', async () => {
      const result = await fetchLinkPreview('http://example.com');
      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should return null when DNS resolves to a blocked IP', async () => {
      mockResolve4.mockResolvedValueOnce(['127.0.0.1']);

      const result = await fetchLinkPreview('https://evil.com');
      expect(result).toBeNull();
    });

    it('should return null when DNS resolution fails', async () => {
      mockResolve4.mockRejectedValueOnce(new Error('DNS failure'));

      const result = await fetchLinkPreview('https://nxdomain.example.com');
      expect(result).toBeNull();
    });

    it('should return null when fetch returns non-ok status', async () => {
      mockFetch.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

      const result = await fetchLinkPreview('https://example.com/missing');
      expect(result).toBeNull();
    });

    it('should return null when response body exceeds 1MB', async () => {
      const bigBody = 'x'.repeat(1024 * 1024 + 1);
      mockFetch.mockResolvedValueOnce(okResponse(bigBody));

      const result = await fetchLinkPreview('https://example.com/huge');
      expect(result).toBeNull();
    });

    it('should return null when fetch throws (timeout)', async () => {
      mockFetch.mockRejectedValueOnce(new Error('AbortError: signal timed out'));

      const result = await fetchLinkPreview('https://slow.example.com');
      expect(result).toBeNull();
    });

    it('should return null when page has no title', async () => {
      const html = htmlPage('<meta property="og:description" content="No title">');
      mockFetch.mockResolvedValueOnce(okResponse(html));

      const result = await fetchLinkPreview('https://example.com/no-title');
      expect(result).toBeNull();
    });

    it('should follow redirects and re-check DNS for each hop', async () => {
      // First request redirects
      mockFetch.mockResolvedValueOnce(redirectResponse('https://final.example.com/page'));
      // Second request returns HTML
      const html = htmlPage(
        '<meta property="og:title" content="Final"><meta property="og:description" content="Desc">',
      );
      mockFetch.mockResolvedValueOnce(okResponse(html));

      // DNS resolves for both hops to public IPs
      mockResolve4
        .mockResolvedValueOnce(['93.184.216.34']) // first hop
        .mockResolvedValueOnce(['93.184.216.35']); // second hop

      const result = assertDefined(await fetchLinkPreview('https://example.com/redirect'));
      expect(result.title).toBe('Final');
      expect(mockResolve4).toHaveBeenCalledTimes(2);
    });

    it('should return null when redirect target resolves to blocked IP', async () => {
      mockFetch.mockResolvedValueOnce(redirectResponse('https://internal.local/secret'));

      // First hop: public IP, second hop: private IP
      mockResolve4
        .mockResolvedValueOnce(['93.184.216.34'])
        .mockResolvedValueOnce(['10.0.0.1']);

      const result = await fetchLinkPreview('https://example.com/ssrf');
      expect(result).toBeNull();
    });

    it('should return null when max redirects exceeded', async () => {
      // 4 redirects (exceeds max of 3)
      mockFetch
        .mockResolvedValueOnce(redirectResponse('https://hop1.example.com'))
        .mockResolvedValueOnce(redirectResponse('https://hop2.example.com'))
        .mockResolvedValueOnce(redirectResponse('https://hop3.example.com'))
        .mockResolvedValueOnce(redirectResponse('https://hop4.example.com'));

      mockResolve4.mockResolvedValue(['93.184.216.34']);

      const result = await fetchLinkPreview('https://example.com/loop');
      expect(result).toBeNull();
    });

    it('should check IPv6 addresses too when resolve4 returns no results', async () => {
      mockResolve4.mockResolvedValueOnce([]);
      mockResolve6.mockResolvedValueOnce(['::1']);

      const result = await fetchLinkPreview('https://ipv6only.example.com');
      expect(result).toBeNull();
    });

    it('should pass correct fetch options', async () => {
      const html = htmlPage(
        '<meta property="og:title" content="Title"><meta property="og:description" content="D">',
      );
      mockFetch.mockResolvedValueOnce(okResponse(html));

      await fetchLinkPreview('https://example.com');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          redirect: 'manual',
          headers: expect.objectContaining({
            'User-Agent': 'ForgeBot/1.0 (+https://forge.internal)',
          }),
        }),
      );
    });

    it('should log a warning on failure', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce(new Error('connection refused'));

      await fetchLinkPreview('https://down.example.com');

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[link-preview]'),
        expect.any(String),
      );
      warnSpy.mockRestore();
    });

    it('should return null when redirect has no Location header', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(null, { status: 302 }),
      );

      const result = await fetchLinkPreview('https://example.com/no-location');
      expect(result).toBeNull();
    });

    it('should return null for redirect to non-https URL', async () => {
      mockFetch.mockResolvedValueOnce(redirectResponse('http://insecure.example.com'));

      const result = await fetchLinkPreview('https://example.com/downgrade');
      expect(result).toBeNull();
    });

    it('should handle non-Error thrown values gracefully', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockFetch.mockRejectedValueOnce('string error');

      const result = await fetchLinkPreview('https://example.com/weird');
      expect(result).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('[link-preview]', 'string error');
      warnSpy.mockRestore();
    });
  });
});
