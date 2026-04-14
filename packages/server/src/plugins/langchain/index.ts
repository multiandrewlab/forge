import type { FastifyInstance, FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import fp from 'fastify-plugin';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { createChatModel } from './provider.js';
import { AiRateLimiter, type AiSlot } from './rate-limiter.js';

declare module 'fastify' {
  interface FastifyInstance {
    aiProvider: () => BaseChatModel;
    aiRateLimit: preHandlerHookHandler;
    aiGate: preHandlerHookHandler[];
    aiAcquire: (userId: string) => AiSlot | null;
  }
  interface FastifyRequest {
    aiSlot?: AiSlot;
  }
}

async function langchainPluginImpl(app: FastifyInstance): Promise<void> {
  let cachedModel: BaseChatModel | null = null;
  const limiter = new AiRateLimiter();

  app.decorate('aiProvider', () => {
    if (!cachedModel) cachedModel = createChatModel();
    return cachedModel;
  });

  const aiRateLimit: preHandlerHookHandler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const userId = request.user?.id;
    if (!userId) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
    const slot = limiter.acquire(userId);
    if (!slot) {
      return reply
        .code(429)
        .header('Retry-After', '5')
        .send({ error: 'AI request already in progress' });
    }
    request.aiSlot = slot;
  };

  app.decorate('aiRateLimit', aiRateLimit);
  app.decorate('aiGate', [app.authenticate, aiRateLimit]);
  app.decorate('aiAcquire', (userId: string) => limiter.acquire(userId));

  // Safety net: release slot at the end of the request lifecycle
  app.addHook('onResponse', async (request) => {
    request.aiSlot?.release();
  });
  app.addHook('onError', async (request) => {
    request.aiSlot?.release();
  });
}

export const langchainPlugin = fp(langchainPluginImpl, {
  name: 'langchain-plugin',
  dependencies: ['auth-plugin'],
});
