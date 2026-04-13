import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConnectionManager } from '../../../plugins/websocket/connections.js';
import type { SocketLike } from '../../../plugins/websocket/connections.js';

function createFakeSocket(): SocketLike {
  return { readyState: 1, send: vi.fn() };
}

describe('ConnectionManager', () => {
  let manager: ConnectionManager;

  beforeEach(() => {
    manager = new ConnectionManager();
  });

  describe('addConnection', () => {
    it('adds a connection retrievable via getConnections', () => {
      const ws = createFakeSocket();
      manager.addConnection('user-1', ws, 'client-a');

      const connections = manager.getConnections('user-1');
      expect(connections.size).toBe(1);
      expect(connections.has(ws)).toBe(true);
    });

    it('supports multiple connections for the same user', () => {
      const ws1 = createFakeSocket();
      const ws2 = createFakeSocket();
      manager.addConnection('user-1', ws1, 'client-a');
      manager.addConnection('user-1', ws2, 'client-b');

      const connections = manager.getConnections('user-1');
      expect(connections.size).toBe(2);
      expect(connections.has(ws1)).toBe(true);
      expect(connections.has(ws2)).toBe(true);
    });
  });

  describe('removeConnection', () => {
    it('removes one connection while keeping others for the same user', () => {
      const ws1 = createFakeSocket();
      const ws2 = createFakeSocket();
      manager.addConnection('user-1', ws1, 'client-a');
      manager.addConnection('user-1', ws2, 'client-b');

      manager.removeConnection('user-1', ws1, 'client-a');

      const connections = manager.getConnections('user-1');
      expect(connections.size).toBe(1);
      expect(connections.has(ws2)).toBe(true);
      expect(connections.has(ws1)).toBe(false);
    });

    it('prunes the user key when the last connection is removed', () => {
      const ws = createFakeSocket();
      manager.addConnection('user-1', ws, 'client-a');
      manager.removeConnection('user-1', ws, 'client-a');

      const connections = manager.getConnections('user-1');
      expect(connections.size).toBe(0);

      // Verify user key is actually pruned from the internal map
      const allConnections = manager.getAllConnections();
      expect(allConnections.has('user-1')).toBe(false);
    });

    it('removes the clientId from the clientId index', () => {
      const ws = createFakeSocket();
      manager.addConnection('user-1', ws, 'client-a');
      manager.removeConnection('user-1', ws, 'client-a');

      expect(manager.findByClientId('client-a')).toBeUndefined();
    });
  });

  describe('getConnections', () => {
    it('returns an empty set for an unknown user', () => {
      const connections = manager.getConnections('nonexistent');
      expect(connections.size).toBe(0);
    });
  });

  describe('findByClientId', () => {
    it('returns the WebSocket for a known clientId', () => {
      const ws = createFakeSocket();
      manager.addConnection('user-1', ws, 'client-a');

      expect(manager.findByClientId('client-a')).toBe(ws);
    });

    it('returns undefined after the clientId is removed', () => {
      const ws = createFakeSocket();
      manager.addConnection('user-1', ws, 'client-a');
      manager.removeConnection('user-1', ws, 'client-a');

      expect(manager.findByClientId('client-a')).toBeUndefined();
    });

    it('returns undefined for an unknown clientId', () => {
      expect(manager.findByClientId('nonexistent')).toBeUndefined();
    });
  });

  describe('getAllConnections', () => {
    it('returns all current user-to-sockets mappings', () => {
      const ws1 = createFakeSocket();
      const ws2 = createFakeSocket();
      const ws3 = createFakeSocket();

      manager.addConnection('user-1', ws1, 'client-a');
      manager.addConnection('user-1', ws2, 'client-b');
      manager.addConnection('user-2', ws3, 'client-c');

      const all = manager.getAllConnections();
      expect(all.size).toBe(2);

      const user1Connections = all.get('user-1');
      expect(user1Connections).toBeDefined();
      expect(user1Connections?.size).toBe(2);

      const user2Connections = all.get('user-2');
      expect(user2Connections).toBeDefined();
      expect(user2Connections?.size).toBe(1);
    });

    it('returns an empty map when no connections exist', () => {
      const all = manager.getAllConnections();
      expect(all.size).toBe(0);
    });
  });
});
