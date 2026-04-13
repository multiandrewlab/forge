import type { FastifyInstance, FastifyRequest } from 'fastify';

/**
 * Read the `x-ws-client-id` request header and return the corresponding
 * WebSocket connection (if any). Used as the `excludeWs` argument to
 * `channels.broadcast()` so the sender does not receive their own event.
 */
export function getExcludeWs(
  app: FastifyInstance,
  request: FastifyRequest,
): ReturnType<FastifyInstance['websocket']['connections']['findByClientId']> {
  const clientId = request.headers['x-ws-client-id'];
  if (typeof clientId !== 'string' || clientId.length === 0) return undefined;
  return app.websocket.connections.findByClientId(clientId);
}
