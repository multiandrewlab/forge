import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { aiCompleteRequestSchema, aiGenerateRequestSchema } from '@forge/shared';
import {
  createAutocompleteChain,
  streamAutocomplete,
} from '../plugins/langchain/chains/autocomplete.js';
import { createGenerateChain, streamGenerate } from '../plugins/langchain/chains/generate.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

const TIMEOUT_MS = 60_000;

function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * Install abort handlers on the request for (a) a hard timeout and
 * (b) client disconnect. Returns a cleanup function that removes both.
 * Exported for direct unit testing to cover both branches against a
 * fake EventEmitter without needing to emit 'close' through light-my-request.
 */
export function createAbortHandlers(
  request: FastifyRequest,
  slot: { controller: AbortController },
  timeoutMs: number,
): () => void {
  const timeout = setTimeout(() => slot.controller.abort(), timeoutMs);
  const onClose = (): void => slot.controller.abort();
  request.raw.on('close', onClose);
  return () => {
    clearTimeout(timeout);
    request.raw.off('close', onClose);
  };
}

export async function aiRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/complete',
    { preHandler: app.aiGate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = aiCompleteRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const slot = request.aiSlot;
      if (!slot) {
        return reply.status(500).send({ error: 'internal_error' });
      }

      const cleanupAborts = createAbortHandlers(request, slot, TIMEOUT_MS);

      reply.raw.writeHead(200, SSE_HEADERS);

      try {
        const chain = createAutocompleteChain(app.aiProvider());
        for await (const token of streamAutocomplete(chain, parsed.data, {
          signal: slot.controller.signal,
        })) {
          writeEvent(reply, 'token', { text: token });
        }
        writeEvent(reply, 'done', {});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream_error';
        writeEvent(reply, 'error', { message });
      } finally {
        cleanupAborts();
        slot.release();
        reply.raw.end();
      }
    },
  );

  app.post(
    '/generate',
    { preHandler: app.aiGate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = aiGenerateRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const slot = request.aiSlot;
      if (!slot) {
        return reply.status(500).send({ error: 'internal_error' });
      }

      const cleanupAborts = createAbortHandlers(request, slot, TIMEOUT_MS);

      reply.raw.writeHead(200, SSE_HEADERS);

      try {
        const chain = createGenerateChain(app.aiProvider());
        for await (const token of streamGenerate(chain, parsed.data, {
          signal: slot.controller.signal,
        })) {
          writeEvent(reply, 'token', { text: token });
        }
        writeEvent(reply, 'done', {});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream_error';
        writeEvent(reply, 'error', { message });
      } finally {
        cleanupAborts();
        slot.release();
        reply.raw.end();
      }
    },
  );
}
