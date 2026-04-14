import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { playgroundRunSchema } from '@forge/shared';
import { getVariablesForPost, assemblePromptForPost } from '../services/playground.js';
import { createPlaygroundChain, streamPlayground } from '../plugins/langchain/chains/playground.js';
import { createAbortHandlers } from './ai.js';
import type { PromptVariableRow } from '../db/queries/types.js';

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

function toVariableResponse(row: PromptVariableRow) {
  return {
    id: row.id,
    postId: row.post_id,
    name: row.name,
    placeholder: row.placeholder,
    defaultValue: row.default_value,
    sortOrder: row.sort_order,
  };
}

export async function playgroundRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/posts/:id/variables',
    { preHandler: app.authenticate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const rows = await getVariablesForPost(id);
      return reply.send({ variables: rows.map(toVariableResponse) });
    },
  );

  app.post(
    '/playground/run',
    { preHandler: app.aiGate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = playgroundRunSchema.safeParse(request.body);
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
        const assembled = await assemblePromptForPost(parsed.data.postId, parsed.data.variables);
        const chain = createPlaygroundChain(app.aiProvider());
        for await (const token of streamPlayground(
          chain,
          { prompt: assembled },
          {
            signal: slot.controller.signal,
          },
        )) {
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
