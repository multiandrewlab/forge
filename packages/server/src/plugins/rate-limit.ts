import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';

async function rateLimitPluginImpl(fastify: FastifyInstance): Promise<void> {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });
}

export const rateLimitPlugin = fp(rateLimitPluginImpl, {
  name: 'rate-limit-plugin',
});
