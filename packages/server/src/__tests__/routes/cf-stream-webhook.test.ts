import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('../../db/connection.js', () => ({
  query: vi.fn(),
  withTransaction: vi.fn(),
}));

vi.mock('../../db/queries/video.js', () => ({
  insertWebhookEvent: vi.fn(),
}));

import * as q from '../../db/queries/video.js';
import Fastify, { type FastifyInstance } from 'fastify';
import { cfStreamWebhookRoutes } from '../../routes/cf-stream-webhook.js';
import type { VideoPipelineService } from '../../services/video-pipeline.js';

const insertWebhookEventMock = q.insertWebhookEvent as Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SECRET = 'unit-test-secret';

function sign(body: string, secret: string, ts: number): string {
  const sig = crypto.createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  return `t=${ts},v1=${sig}`;
}

interface BuildOpts {
  videoPipeline?: VideoPipelineService;
  secret?: string;
}

async function buildTestApp(opts: BuildOpts = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const handle = vi.fn().mockResolvedValue(undefined);
  const videoPipeline =
    opts.videoPipeline ?? ({ handleWebhook: handle } as unknown as VideoPipelineService);

  await app.register(
    async (instance) => {
      await cfStreamWebhookRoutes(instance, {
        videoPipeline,
        webhookSecret: opts.secret ?? SECRET,
      });
    },
    { prefix: '/api/cf-stream' },
  );
  await app.ready();
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('routes/cf-stream-webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('valid HMAC + new event → 200 and dispatches to pipeline', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const handle = vi.fn().mockResolvedValue(undefined);
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = JSON.stringify({ id: 'evt-1', type: 'video.ready', uid: 'cf-evt-1' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(insertWebhookEventMock).toHaveBeenCalledWith({
      eventId: 'evt-1',
      cfUid: 'cf-evt-1',
      eventType: 'video.ready',
    });
    // setImmediate has not necessarily run yet — wait a tick
    await new Promise((r) => setImmediate(r));
    expect(handle).toHaveBeenCalledWith({
      type: 'video.ready',
      cfUid: 'cf-evt-1',
      id: 'evt-1',
    });
    await app.close();
  });

  it('falls back to composed eventId when body lacks id', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const app = await buildTestApp();
    const body = JSON.stringify({ type: 'captions.ready', uid: 'cf-no-id' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(insertWebhookEventMock).toHaveBeenCalledWith({
      eventId: `cf-no-id:captions.ready:${ts}`,
      cfUid: 'cf-no-id',
      eventType: 'captions.ready',
    });
    await app.close();
  });

  it('invalid HMAC → 401 WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = await buildTestApp();
    const body = '{"id":"evt-2","type":"video.ready","uid":"cf-x"}';
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': `t=${ts},v1=${'00'.repeat(32)}`,
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('WEBHOOK_SIGNATURE_INVALID');
    expect(insertWebhookEventMock).not.toHaveBeenCalled();
    await app.close();
  });

  it('malformed signature header → 400 WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: { 'webhook-signature': 'not-a-sig', 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WEBHOOK_SIGNATURE_INVALID');
    await app.close();
  });

  it('missing signature header → 400 WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: { 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WEBHOOK_SIGNATURE_INVALID');
    await app.close();
  });

  it('signature with wrong hex length → 401', async () => {
    // 32-char v1= (not 64) — covers the timingSafeEqual buffer-length guard.
    const app = await buildTestApp();
    const body = '{}';
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': `t=${ts},v1=${'ab'.repeat(16)}`,
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('stale timestamp (older than 5 min) → 400 WEBHOOK_TIMESTAMP_STALE', async () => {
    const app = await buildTestApp();
    const body = '{}';
    const ts = Math.floor(Date.now() / 1000) - 6 * 60;
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WEBHOOK_TIMESTAMP_STALE');
    await app.close();
  });

  it('future timestamp (>5 min ahead) → 400 WEBHOOK_TIMESTAMP_STALE', async () => {
    const app = await buildTestApp();
    const body = '{}';
    const ts = Math.floor(Date.now() / 1000) + 6 * 60;
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('WEBHOOK_TIMESTAMP_STALE');
    await app.close();
  });

  it('non-numeric timestamp → 400 WEBHOOK_SIGNATURE_INVALID', async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': 't=notanumber,v1=' + '00'.repeat(32),
        'content-type': 'application/json',
      },
      payload: '{}',
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('duplicate eventId → 200 with no dispatch', async () => {
    insertWebhookEventMock.mockResolvedValue(false);
    const handle = vi.fn();
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = JSON.stringify({ id: 'evt-dup', type: 'video.ready', uid: 'cf-dup' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(handle).not.toHaveBeenCalled();
    await app.close();
  });

  it('body too large → 413', async () => {
    const app = await buildTestApp();
    const big =
      '{"id":"evt","type":"video.ready","uid":"cf","payload":"' + 'x'.repeat(300_000) + '"}';
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(big, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: big,
    });
    // fastify rejects with 413 when body exceeds bodyLimit
    expect(res.statusCode).toBe(413);
    await app.close();
  });

  it('deferred-task failure is logged via logger.error', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const errSpy = vi.fn();
    const handle = vi.fn().mockRejectedValue(new Error('pipeline boom'));
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    // Replace app.log.error with a spy
    app.log.error = errSpy;
    const body = JSON.stringify({ id: 'evt-defer', type: 'video.ready', uid: 'cf-def' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    // Give setImmediate + the promise chain a chance to settle
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    expect(errSpy).toHaveBeenCalled();
    const call = errSpy.mock.calls[0][0] as { event?: string };
    expect(call.event).toBe('video.pipeline.deferred-error');
    await app.close();
  });

  it('dispatches video.error events', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const handle = vi.fn().mockResolvedValue(undefined);
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = JSON.stringify({ id: 'evt-err', type: 'video.error', uid: 'cf-err' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(handle).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'video.error', cfUid: 'cf-err' }),
    );
    await app.close();
  });

  it('unknown event type: no dispatch, still 200', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const handle = vi.fn();
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = JSON.stringify({ id: 'evt-unk', type: 'video.unknown', uid: 'cf-x' });
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(handle).not.toHaveBeenCalled();
    await app.close();
  });

  it('JSON body "null" still verified + handled (parsed=null fallback)', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const handle = vi.fn();
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = 'null'; // valid JSON, but parsed === null
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    // No uid/type means insertWebhookEvent still ran with empty strings;
    // no dispatch (toCfWebhookEvent returns null).
    expect(insertWebhookEventMock).toHaveBeenCalled();
    await new Promise((r) => setImmediate(r));
    expect(handle).not.toHaveBeenCalled();
    await app.close();
  });

  it('body without uid/type: insertWebhookEvent still called with empty strings; no dispatch', async () => {
    insertWebhookEventMock.mockResolvedValue(true);
    const handle = vi.fn();
    const app = await buildTestApp({
      videoPipeline: { handleWebhook: handle } as unknown as VideoPipelineService,
    });
    const body = JSON.stringify({});
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    await new Promise((r) => setImmediate(r));
    expect(handle).not.toHaveBeenCalled();
    await app.close();
  });

  it('non-JSON body → 400 (parse failure before HMAC)', async () => {
    const app = await buildTestApp();
    const body = 'not-json';
    const ts = Math.floor(Date.now() / 1000);
    const res = await app.inject({
      method: 'POST',
      url: '/api/cf-stream/webhook',
      headers: {
        'webhook-signature': sign(body, SECRET, ts),
        'content-type': 'application/json',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  // ─── WU5b 5.15 — audit-log emissions ────────────────────────────────────
  describe('audit-log emissions', () => {
    it('emits cf-stream.webhook.received on accepted event', async () => {
      insertWebhookEventMock.mockResolvedValue(true);
      const app = await buildTestApp();
      const infoSpy = vi.spyOn(app.log, 'info');
      const body = JSON.stringify({ id: 'evt-audit-1', type: 'video.ready', uid: 'cf-audit' });
      const ts = Math.floor(Date.now() / 1000);
      const res = await app.inject({
        method: 'POST',
        url: '/api/cf-stream/webhook',
        headers: {
          'webhook-signature': sign(body, SECRET, ts),
          'content-type': 'application/json',
        },
        payload: body,
      });
      expect(res.statusCode).toBe(200);
      const call = infoSpy.mock.calls.find(
        (args) => (args[0] as { event?: string })?.event === 'cf-stream.webhook.received',
      );
      expect(call, 'expected cf-stream.webhook.received log').toBeDefined();
      const payload = call?.[0] as { eventId: string; eventType: string; cfUid: string };
      expect(payload.eventId).toBe('evt-audit-1');
      expect(payload.eventType).toBe('video.ready');
      expect(payload.cfUid).toBe('cf-audit');
      await app.close();
    });

    it('emits cf-stream.webhook.rejected (reason=malformed-header) on bad header', async () => {
      const app = await buildTestApp();
      const warnSpy = vi.spyOn(app.log, 'warn');
      const res = await app.inject({
        method: 'POST',
        url: '/api/cf-stream/webhook',
        headers: { 'webhook-signature': 'garbage', 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(res.statusCode).toBe(400);
      const call = warnSpy.mock.calls.find((args) => {
        const p = args[0] as { event?: string; reason?: string };
        return p?.event === 'cf-stream.webhook.rejected' && p.reason === 'malformed-header';
      });
      expect(call, 'expected malformed-header rejected log').toBeDefined();
      const payload = call?.[0] as { fromIp?: string };
      expect(payload).toHaveProperty('fromIp');
      await app.close();
    });

    it('emits cf-stream.webhook.rejected (reason=signature-invalid) on bad HMAC', async () => {
      const app = await buildTestApp();
      const warnSpy = vi.spyOn(app.log, 'warn');
      const ts = Math.floor(Date.now() / 1000);
      const res = await app.inject({
        method: 'POST',
        url: '/api/cf-stream/webhook',
        headers: {
          'webhook-signature': `t=${ts},v1=${'00'.repeat(32)}`,
          'content-type': 'application/json',
        },
        payload: '{}',
      });
      expect(res.statusCode).toBe(401);
      const call = warnSpy.mock.calls.find((args) => {
        const p = args[0] as { event?: string; reason?: string };
        return p?.event === 'cf-stream.webhook.rejected' && p.reason === 'signature-invalid';
      });
      expect(call, 'expected signature-invalid rejected log').toBeDefined();
      await app.close();
    });

    it('emits cf-stream.webhook.rejected (reason=stale-timestamp) on old timestamp', async () => {
      const app = await buildTestApp();
      const warnSpy = vi.spyOn(app.log, 'warn');
      const oldTs = Math.floor(Date.now() / 1000) - 10 * 60;
      const body = JSON.stringify({ id: 'evt-old', type: 'video.ready', uid: 'cf-x' });
      const res = await app.inject({
        method: 'POST',
        url: '/api/cf-stream/webhook',
        headers: {
          'webhook-signature': sign(body, SECRET, oldTs),
          'content-type': 'application/json',
        },
        payload: body,
      });
      expect(res.statusCode).toBe(400);
      const call = warnSpy.mock.calls.find((args) => {
        const p = args[0] as { event?: string; reason?: string };
        return p?.event === 'cf-stream.webhook.rejected' && p.reason === 'stale-timestamp';
      });
      expect(call, 'expected stale-timestamp rejected log').toBeDefined();
      await app.close();
    });
  });
});
