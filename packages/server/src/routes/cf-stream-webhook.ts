// Cloudflare Stream webhook receiver (issue #102, plan WU5a — endpoint 5.8).
//
// Cloudflare delivers webhook events with a `Webhook-Signature: t=<ts>,v1=<hex>`
// header. The HMAC-SHA256 is computed over `${t}.${rawBody}` using the
// pre-shared secret. We must:
//
//   1. Read the RAW body bytes (signing is over the raw request, not a
//      re-serialized parse).
//   2. Verify the HMAC with `crypto.timingSafeEqual` on equal-length buffers.
//   3. Reject stale (>5 min) or future-shifted timestamps.
//   4. Insert into `cf_stream_webhook_events` for idempotency; on duplicate
//      `event_id`, reply 200 immediately without dispatching.
//   5. Dispatch via `videoPipeline.handleWebhook(...)` inside `setImmediate`
//      so the HTTP reply path stays non-blocking.
//
// Fastify default behaviour is to parse `application/json` into `request.body`
// and discard the raw bytes. We scope a per-route raw-string content-type
// parser so the handler can verify HMAC against the original bytes the client
// sent.

import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import * as q from '../db/queries/video.js';
import type { VideoPipelineService, CfWebhookEvent } from '../services/video-pipeline.js';

const MAX_BODY_BYTES = 256 * 1024;
const TIMESTAMP_TOLERANCE_SECONDS = 5 * 60;

export interface CfStreamWebhookRouteDeps {
  videoPipeline: VideoPipelineService;
  webhookSecret: string;
}

interface ParsedBody {
  raw: string;
  parsed: unknown;
}

interface CfEventBody {
  id?: string;
  type?: string;
  uid?: string;
  data?: unknown;
}

export async function cfStreamWebhookRoutes(
  app: FastifyInstance,
  deps: CfStreamWebhookRouteDeps,
): Promise<void> {
  const { videoPipeline, webhookSecret } = deps;

  // Per-route raw-string parser: capture the raw bytes alongside the parsed
  // JSON so HMAC verification operates on the exact bytes the client sent.
  // Scoped to this `register` block so other routes' default JSON parser is
  // untouched.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string', bodyLimit: MAX_BODY_BYTES },
    (_req, body, done) => {
      try {
        const parsed = JSON.parse(body as string) as unknown;
        const result: ParsedBody = { raw: body as string, parsed };
        done(null, result);
      } catch (err) {
        const e = err as Error & { statusCode?: number };
        e.statusCode = 400;
        done(e);
      }
    },
  );

  app.post(
    '/webhook',
    {
      bodyLimit: MAX_BODY_BYTES,
      config: {
        rateLimit: { max: 600, timeWindow: '1 minute' },
      },
    },
    async (request, reply) => {
      const { raw, parsed } = request.body as ParsedBody;

      // 1. Parse signature header
      const header = request.headers['webhook-signature'];
      const parsedSig = parseSignatureHeader(typeof header === 'string' ? header : undefined);
      if (!parsedSig) {
        // TODO[WU5b]: emit `cf-stream.webhook.rejected` reason=malformed-header.
        return reply.status(400).send({
          error: 'Malformed Webhook-Signature header',
          code: 'WEBHOOK_SIGNATURE_INVALID',
        });
      }
      const { t, v1 } = parsedSig;

      // 2. Verify HMAC
      const expected = crypto
        .createHmac('sha256', webhookSecret)
        .update(`${t}.${raw}`)
        .digest('hex');
      const expectedBuf = Buffer.from(expected, 'hex');
      const givenBuf = Buffer.from(v1, 'hex');
      if (
        expectedBuf.length !== givenBuf.length ||
        !crypto.timingSafeEqual(expectedBuf, givenBuf)
      ) {
        // TODO[WU5b]: emit `cf-stream.webhook.rejected` reason=signature-invalid.
        return reply.status(401).send({
          error: 'Invalid webhook signature',
          code: 'WEBHOOK_SIGNATURE_INVALID',
        });
      }

      // 3. Timestamp freshness
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - t) > TIMESTAMP_TOLERANCE_SECONDS) {
        // TODO[WU5b]: emit `cf-stream.webhook.rejected` reason=stale-timestamp.
        return reply.status(400).send({
          error: 'Webhook timestamp is stale',
          code: 'WEBHOOK_TIMESTAMP_STALE',
        });
      }

      // 4. Idempotency
      const body = (parsed ?? {}) as CfEventBody;
      const cfUid = typeof body.uid === 'string' ? body.uid : '';
      const eventType = typeof body.type === 'string' ? body.type : '';
      const eventId =
        typeof body.id === 'string' && body.id ? body.id : `${cfUid}:${eventType}:${t}`;
      const inserted = await q.insertWebhookEvent({ eventId, cfUid, eventType });
      // TODO[WU5b]: emit `cf-stream.webhook.received` here (only when inserted).
      if (!inserted) {
        return reply.status(200).send({ ok: true });
      }

      // 5. Dispatch (deferred) — never block the HTTP reply on pipeline work.
      const event = toCfWebhookEvent(body);
      if (event) {
        setImmediate(() => {
          videoPipeline.handleWebhook(event).catch((err: unknown) => {
            app.log.error(
              { event: 'video.pipeline.deferred-error', err },
              'deferred pipeline task failed',
            );
          });
        });
      }

      return reply.status(200).send({ ok: true });
    },
  );
}

function parseSignatureHeader(header: string | undefined): { t: number; v1: string } | null {
  if (!header) return null;
  const parts = header.split(',').map((s) => s.trim());
  let t: number | null = null;
  let v1: string | null = null;
  for (const p of parts) {
    if (p.startsWith('t=')) {
      const n = Number(p.slice(2));
      if (Number.isFinite(n)) t = Math.trunc(n);
    } else if (p.startsWith('v1=')) {
      v1 = p.slice(3);
    }
  }
  if (t == null || !v1) return null;
  return { t, v1 };
}

function toCfWebhookEvent(body: CfEventBody): CfWebhookEvent | null {
  if (typeof body.uid !== 'string' || typeof body.type !== 'string') return null;
  switch (body.type) {
    case 'video.ready':
      return { type: 'video.ready', cfUid: body.uid, id: body.id } as unknown as CfWebhookEvent;
    case 'captions.ready':
      return { type: 'captions.ready', cfUid: body.uid, id: body.id } as unknown as CfWebhookEvent;
    case 'video.error':
      return { type: 'video.error', cfUid: body.uid, id: body.id } as unknown as CfWebhookEvent;
    default:
      return null;
  }
}
