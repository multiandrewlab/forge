/**
 * Centralised pino logger factory.
 *
 * The redact paths protect:
 *   - request bodies that carry transcripts, tokens, or playback URLs (which embed
 *     a CF Stream JWT in the URL path — spec §12 explicitly requires whole-field
 *     redaction of `playbackUrl` so a stray `log.info(req)` cannot leak the JWT)
 *   - CF Stream credentials at any nesting depth: API token, webhook secret, signing key PEM
 *   - `Set-Cookie` response headers (session cookies)
 *
 * Pino's `*` wildcard matches one level only — known nested paths are listed
 * explicitly. The redaction test enumerates every redacted shape.
 */

import pino, { type Logger } from 'pino';
import type { Writable } from 'node:stream';

export type CreateLoggerOpts = {
  destination?: Writable;
  level?: string;
};

export function createLogger(opts: CreateLoggerOpts = {}): Logger {
  const level =
    opts.level ??
    process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === 'production' ? 'info' : 'debug');

  const baseOpts = {
    level,
    redact: {
      paths: [
        // Video transcript bodies (spec §14)
        'request.body.transcript',
        'transcript',
        '*.transcript',

        // Auth tokens — generic + nested + on request bodies
        'token',
        '*.token',
        'nested.token',
        'request.body.token',

        // PEM-encoded private keys
        'pem',
        '*.pem',
        'request.body.pem',

        // CF Stream API token (any nesting)
        'apiToken',
        '*.apiToken',

        // CF Stream webhook secret (any nesting)
        'webhookSecret',
        '*.webhookSecret',

        // CF Stream signing-key PEM (any nesting)
        'signingKeyPem',
        '*.signingKeyPem',

        // CF playback URL — JWT is embedded as a URL path segment, so the WHOLE
        // field is redacted (not a regex substring). Spec §12.
        'playbackUrl',
        '*.playbackUrl',
        'response.playbackUrl',
        'request.body.playbackUrl',

        // Session cookies
        'res.headers["set-cookie"]',
      ],
      censor: '[REDACTED]',
      remove: false,
    },
  } satisfies pino.LoggerOptions;

  return opts.destination ? pino(baseOpts, opts.destination) : pino(baseOpts);
}
