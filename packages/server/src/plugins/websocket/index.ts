import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import websocket from '@fastify/websocket';
import { ConnectionManager } from './connections.js';
import { ChannelManager } from './channels.js';
import { PresenceTracker, createPresenceEvictionInterval } from './presence.js';
import { handleConnection } from './handler.js';

declare module 'fastify' {
  interface FastifyInstance {
    websocket: {
      connections: ConnectionManager;
      channels: ChannelManager;
      presence: PresenceTracker;
    };
  }
}

async function websocketPluginImpl(app: FastifyInstance): Promise<void> {
  // Register the underlying @fastify/websocket plugin
  await app.register(websocket);

  // Build the three manager instances
  const connections = new ConnectionManager();
  const channels = new ChannelManager();
  const presence = new PresenceTracker();

  // Start the presence eviction interval
  const evictionHandle = createPresenceEvictionInterval(
    presence,
    channels as unknown as Parameters<typeof createPresenceEvictionInterval>[1],
  );

  // Clear the eviction interval when the app closes
  app.addHook('onClose', async () => {
    clearInterval(evictionHandle);
  });

  // Decorate the app with the websocket managers
  app.decorate('websocket', {
    connections,
    channels,
    presence,
  });

  // Register the /ws WebSocket route
  app.get('/ws', { websocket: true }, (socket, req) => {
    handleConnection(app, socket, req, { connections, channels, presence });
  });
}

export const websocketPlugin = fp(websocketPluginImpl, {
  name: 'websocket-plugin',
  dependencies: ['auth-plugin'],
});
