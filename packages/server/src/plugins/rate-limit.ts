import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import { isE2EFlagSet } from '../lib/env-guards.js';

async function rateLimitPluginImpl(fastify: FastifyInstance): Promise<void> {
  // The E2E journey fires many requests per worker in a tight window. The
  // 100/min default budget is exhausted before Phase 6 (permission) runs,
  // surfacing as a 429 on a benign GET that should expose a 403 instead.
  // Bump the global ceiling in E2E mode; route-level limiters (auth login,
  // votes, etc.) keep their stricter own caps.
  const max = isE2EFlagSet(process.env.E2E_MODE) ? 10_000 : 100;
  await fastify.register(rateLimit, {
    max,
    timeWindow: '1 minute',
  });
}

export const rateLimitPlugin = fp(rateLimitPluginImpl, {
  name: 'rate-limit-plugin',
});
