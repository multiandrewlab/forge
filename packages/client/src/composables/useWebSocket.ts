import { toRef } from 'vue';
import type { ClientMessage, ServerMessage } from '@forge/shared';
import { useRealtimeStore } from '@/stores/realtime';
import type { RealtimeStatus } from '@/stores/realtime';

// ── Module-scoped singletons ───────────────────────────────────────────

const clientId: string = crypto.randomUUID();

let socket: WebSocket | null = null;
const handlers = new Map<string, Set<(event: ServerMessage) => void>>();
let pendingQueue: ClientMessage[] = [];
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let currentTokenProvider: (() => Promise<string>) | null = null;
let intentionalClose = false;
let connected = false;

// ── Internal helpers ───────────────────────────────────────────────────

function getWsUrl(): string {
  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  if (envUrl) return envUrl;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function setStatus(newStatus: RealtimeStatus): void {
  const store = useRealtimeStore();
  store.setStatus(newStatus);
}

function isSocketOpen(): boolean {
  return socket !== null && socket.readyState === WebSocket.OPEN && connected;
}

function sendRaw(message: ClientMessage): void {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function flushPendingQueue(): void {
  const queue = [...pendingQueue];
  pendingQueue = [];
  for (const msg of queue) {
    sendRaw(msg);
  }
}

function resubscribeAll(): void {
  for (const channel of handlers.keys()) {
    sendRaw({ type: 'subscribe', channel });
  }
}

function dispatchMessage(message: ServerMessage): void {
  if ('channel' in message && typeof message.channel === 'string') {
    const channelHandlers = handlers.get(message.channel);
    if (channelHandlers) {
      for (const handler of channelHandlers) {
        handler(message);
      }
    }
  }
}

function handleAuthOk(): void {
  connected = true;
  reconnectDelay = 1000;
  setStatus('connected');
  resubscribeAll();
  flushPendingQueue();
}

function handleAuthError(): void {
  connected = false;
  setStatus('disconnected');
  // Do NOT reconnect — bad creds won't resolve on their own
}

async function handleAuthExpired(): Promise<void> {
  // currentTokenProvider is always set before openSocket is called,
  // so this is guaranteed non-null at this point.
  const tokenProvider = currentTokenProvider as () => Promise<string>;
  const token = await tokenProvider();
  sendRaw({ type: 'auth', token });
}

function scheduleReconnect(): void {
  setStatus('reconnecting');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openSocket();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
}

function openSocket(): void {
  const isReconnect = socket !== null;
  socket = new WebSocket(getWsUrl());
  setStatus(isReconnect ? 'reconnecting' : 'connecting');
  connected = false;

  socket.onopen = () => {
    // currentTokenProvider is always set by connect() before openSocket() is called
    const tokenProvider = currentTokenProvider as () => Promise<string>;
    void tokenProvider().then((token) => {
      sendRaw({ type: 'auth', token });
    });
  };

  socket.onmessage = (event: MessageEvent) => {
    const data = JSON.parse(event.data as string) as ServerMessage;

    switch (data.type) {
      case 'auth:ok':
        handleAuthOk();
        break;
      case 'auth:error':
        handleAuthError();
        break;
      case 'auth:expired':
        void handleAuthExpired();
        break;
      default:
        dispatchMessage(data);
        break;
    }
  };

  socket.onclose = () => {
    connected = false;
    if (!intentionalClose) {
      scheduleReconnect();
    }
  };

  socket.onerror = () => {
    // The close event will also fire; logging only
  };
}

// ── Public composable ──────────────────────────────────────────────────

export function useWebSocket(): {
  subscribe: (channel: string, handler: (event: ServerMessage) => void) => () => void;
  send: (message: ClientMessage) => void;
  connect: (tokenProvider: () => Promise<string>) => void;
  disconnect: () => void;
  clientId: string;
  status: ReturnType<typeof toRef<RealtimeStatus>>;
} {
  const store = useRealtimeStore();

  function connect(tokenProvider: () => Promise<string>): void {
    currentTokenProvider = tokenProvider;
    intentionalClose = false;
    openSocket();
  }

  function disconnect(): void {
    intentionalClose = true;
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    if (socket) {
      socket.close();
    }
    socket = null;
    connected = false;
    handlers.clear();
    pendingQueue = [];
    setStatus('disconnected');
  }

  function subscribe(channel: string, handler: (event: ServerMessage) => void): () => void {
    let channelSet = handlers.get(channel);
    if (!channelSet) {
      channelSet = new Set();
      handlers.set(channel, channelSet);
    }
    channelSet.add(handler);

    // Send subscribe frame if already connected
    if (isSocketOpen()) {
      sendRaw({ type: 'subscribe', channel });
    }

    let removed = false;
    return () => {
      if (removed) return;
      removed = true;

      const set = handlers.get(channel);
      if (!set) return;
      set.delete(handler);

      if (set.size === 0) {
        handlers.delete(channel);
        if (isSocketOpen()) {
          sendRaw({ type: 'unsubscribe', channel });
        }
      }
    };
  }

  function send(message: ClientMessage): void {
    if (isSocketOpen()) {
      sendRaw(message);
    } else {
      pendingQueue.push(message);
    }
  }

  return {
    subscribe,
    send,
    connect,
    disconnect,
    clientId,
    status: toRef(store, 'status'),
  };
}
