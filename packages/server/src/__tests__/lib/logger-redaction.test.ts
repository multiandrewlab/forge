import { describe, it, expect } from 'vitest';
import { Writable } from 'node:stream';
import { createLogger } from '../../logger.js';

describe('pino redaction', () => {
  function captureLogs(): { logs: string[]; stream: Writable } {
    const logs: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        logs.push(chunk.toString());
        cb();
      },
    });
    return { logs, stream };
  }

  it.each([
    ['request.body.transcript', { request: { body: { transcript: 'SECRET-TRANSCRIPT' } } }],
    ['*.token (top-level + nested)', { token: 'SECRET-TOKEN', nested: { token: 'SECRET-NESTED' } }],
    ['*.pem', { pem: '-----BEGIN PRIVATE KEY----- SECRET-PEM-BODY' }],
    ['*.apiToken', { apiToken: 'SECRET-API' }],
    ['*.webhookSecret', { webhookSecret: 'SECRET-WEBHOOK' }],
    ['*.signingKeyPem', { signingKeyPem: 'SECRET-SIGNING-PEM' }],
    [
      '*.playbackUrl (top-level)',
      {
        playbackUrl:
          'https://customer-x.cloudflarestream.com/SECRET-JWT-eyJhbGc.PAYLOAD.SIG/manifest/video.m3u8',
      },
    ],
    [
      'response.playbackUrl',
      {
        response: {
          playbackUrl:
            'https://customer-x.cloudflarestream.com/SECRET-JWT-IN-RES/manifest/video.m3u8',
        },
      },
    ],
    [
      'request.body.playbackUrl',
      {
        request: {
          body: {
            playbackUrl:
              'https://customer-x.cloudflarestream.com/SECRET-JWT-IN-REQ/manifest/video.m3u8',
          },
        },
      },
    ],
    [
      'res.headers.set-cookie',
      { res: { headers: { 'set-cookie': 'SECRET-COOKIE=value; HttpOnly' } } },
    ],
  ])('masks %s', (_label, payload) => {
    const { logs, stream } = captureLogs();
    const log = createLogger({ destination: stream });
    log.info(payload, 'test message');
    const allOutput = logs.join('');
    expect(allOutput).not.toContain('SECRET');
    expect(allOutput).toContain('[REDACTED]');
  });

  it('still logs non-secret fields', () => {
    const { logs, stream } = captureLogs();
    const log = createLogger({ destination: stream });
    log.info({ postId: 'public-id', count: 42 }, 'public message');
    const allOutput = logs.join('');
    expect(allOutput).toContain('public-id');
    expect(allOutput).toContain('42');
  });

  it('uses opts.level when provided', () => {
    const { logs, stream } = captureLogs();
    const log = createLogger({ destination: stream, level: 'warn' });
    log.info({ msg: 'should-not-appear' }, 'info-message');
    log.warn({ msg: 'should-appear' }, 'warn-message');
    const allOutput = logs.join('');
    expect(allOutput).not.toContain('should-not-appear');
    expect(allOutput).toContain('should-appear');
  });

  it('defaults to a usable logger when no destination is provided', () => {
    // Sanity: the no-arg form returns a valid pino instance without throwing.
    const log = createLogger();
    expect(typeof log.info).toBe('function');
    expect(typeof log.warn).toBe('function');
    expect(typeof log.error).toBe('function');
  });
});
