import dns from 'node:dns/promises';
import * as cheerio from 'cheerio';
import ipaddr from 'ipaddr.js';
import type { LinkPreview } from '@forge/shared';

/** Maximum response body size in bytes (1 MB). */
const MAX_BODY_BYTES = 1024 * 1024;

/** Fetch timeout in milliseconds. */
const FETCH_TIMEOUT_MS = 5000;

/** Maximum number of HTTP redirects to follow. */
const MAX_REDIRECTS = 3;

/** User-Agent header sent with preview requests. */
const USER_AGENT = 'ForgeBot/1.0 (+https://forge.internal)';

/** Words per minute used for reading-time calculation. */
const WORDS_PER_MINUTE = 200;

/**
 * CIDR ranges that must be blocked to prevent SSRF attacks.
 * Covers loopback, private, link-local, CGNAT, IETF protocol, and IPv6 equivalents.
 */
const BLOCKED_RANGES: Array<[ipaddr.IPv4 | ipaddr.IPv6, number]> = [
  // IPv4
  [ipaddr.IPv4.parse('127.0.0.0'), 8],
  [ipaddr.IPv4.parse('10.0.0.0'), 8],
  [ipaddr.IPv4.parse('172.16.0.0'), 12],
  [ipaddr.IPv4.parse('192.168.0.0'), 16],
  [ipaddr.IPv4.parse('169.254.0.0'), 16],
  [ipaddr.IPv4.parse('0.0.0.0'), 8],
  [ipaddr.IPv4.parse('100.64.0.0'), 10],
  [ipaddr.IPv4.parse('192.0.0.0'), 24],
  // IPv6
  [ipaddr.IPv6.parse('::1'), 128],
  [ipaddr.IPv6.parse('fc00::'), 7],
  [ipaddr.IPv6.parse('fe80::'), 10],
];

/**
 * Validate that a URL string is a well-formed https:// URL.
 * Returns the parsed URL on success, or null if the URL is invalid or non-https.
 */
export function validateUrl(url: string): URL | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Check whether an IP address falls within any SSRF-blocked CIDR range.
 * Supports both IPv4 and IPv6 addresses.
 */
export function isIpBlocked(ip: string): boolean {
  const addr = ipaddr.parse(ip);
  for (const [network, prefix] of BLOCKED_RANGES) {
    // Only compare addresses of the same kind (IPv4 vs IPv6)
    if (addr.kind() === network.kind() && addr.match([network, prefix])) {
      return true;
    }
  }
  return false;
}

/**
 * Parse Open Graph metadata from an HTML string.
 * Falls back to `<title>` and `meta[name="description"]` when OG tags are absent.
 * Returns null if no title can be determined.
 */
export function parseOpenGraph(html: string): LinkPreview | null {
  const $ = cheerio.load(html);

  const title =
    $('meta[property="og:title"]').attr('content')?.trim() || $('title').text().trim() || null;

  if (!title) return null;

  const description =
    $('meta[property="og:description"]').attr('content')?.trim() ||
    $('meta[name="description"]').attr('content')?.trim() ||
    '';

  const rawImage = $('meta[property="og:image"]').attr('content')?.trim() || null;
  const image = rawImage && rawImage.startsWith('https://') ? rawImage : null;

  // Strip HTML tags and count words for reading time
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const readingTime = Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE));

  return { title, description, image, readingTime };
}

/**
 * Resolve all IP addresses for a hostname and check them against the SSRF blocklist.
 * Returns true if the hostname is safe to fetch, false if any address is blocked.
 */
async function dnsCheck(hostname: string): Promise<boolean> {
  let ipv4: string[] = [];
  let ipv6: string[] = [];

  try {
    ipv4 = await dns.resolve4(hostname);
  } catch {
    // No A records
  }

  try {
    ipv6 = await dns.resolve6(hostname);
  } catch {
    // No AAAA records
  }

  const allIps = [...ipv4, ...ipv6];
  if (allIps.length === 0) return false;

  return allIps.every((ip) => !isIpBlocked(ip));
}

/**
 * Fetch a link preview for the given URL.
 *
 * Orchestrates the full pipeline:
 * 1. Validate URL (must be https)
 * 2. DNS-resolve the hostname and check against SSRF blocklist
 * 3. Fetch with manual redirect handling (each hop re-resolves DNS)
 * 4. Enforce 1 MB body cap
 * 5. Parse Open Graph metadata
 *
 * Returns null on any failure — never throws.
 */
export async function fetchLinkPreview(url: string): Promise<LinkPreview | null> {
  try {
    let currentUrl = url;
    let redirectCount = 0;

    // Validate the initial URL
    const parsed = validateUrl(currentUrl);
    if (!parsed) {
      console.warn('[link-preview]', `Invalid or non-https URL: ${url}`);
      return null;
    }

    // DNS check for the initial host
    if (!(await dnsCheck(parsed.hostname))) {
      console.warn('[link-preview]', `DNS check failed for ${parsed.hostname}`);
      return null;
    }

    // Fetch loop with redirect handling
    while (true) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          'User-Agent': USER_AGENT,
        },
      });

      // Handle redirects
      if (response.status >= 300 && response.status < 400) {
        redirectCount++;
        if (redirectCount > MAX_REDIRECTS) {
          console.warn('[link-preview]', `Too many redirects for ${url}`);
          return null;
        }

        const location = response.headers.get('location');
        if (!location) {
          console.warn('[link-preview]', `Redirect without Location header for ${url}`);
          return null;
        }

        // Validate the redirect target
        const nextUrl = validateUrl(location);
        if (!nextUrl) {
          console.warn('[link-preview]', `Redirect to non-https URL: ${location}`);
          return null;
        }

        // Re-check DNS for the redirect target
        if (!(await dnsCheck(nextUrl.hostname))) {
          console.warn(
            '[link-preview]',
            `DNS check failed for redirect target ${nextUrl.hostname}`,
          );
          return null;
        }

        currentUrl = location;
        continue;
      }

      // Non-ok status
      if (!response.ok) {
        console.warn('[link-preview]', `HTTP ${response.status} for ${currentUrl}`);
        return null;
      }

      // Body size check
      const body = await response.text();
      if (body.length > MAX_BODY_BYTES) {
        console.warn('[link-preview]', `Response too large for ${currentUrl}`);
        return null;
      }

      // Parse OG metadata
      const preview = parseOpenGraph(body);
      if (!preview) {
        console.warn('[link-preview]', `No title found in ${currentUrl}`);
        return null;
      }

      return preview;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[link-preview]', message);
    return null;
  }
}
