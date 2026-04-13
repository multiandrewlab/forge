import { getCurrentScope, onScopeDispose } from 'vue';

// ── Module-scoped state ───────────────────────────────────────────────

type Handler = () => void;

const registry = new Map<string, Set<Handler>>();
let listenerAttached = false;

// ── Platform detection ────────────────────────────────────────────────

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.platform.toLowerCase().includes('mac');
}

// ── Shortcut parsing ──────────────────────────────────────────────────

interface ParsedShortcut {
  key: string;
  mod: boolean;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  const first = parts[0] as string;
  if (parts.length === 2) {
    const second = parts[1] as string;
    if (first === 'mod') {
      return { key: second, mod: true };
    }
  }
  return { key: first, mod: false };
}

// ── Event matching ────────────────────────────────────────────────────

function matchesShortcut(event: KeyboardEvent, parsed: ParsedShortcut): boolean {
  if (event.key.toLowerCase() !== parsed.key) return false;

  if (parsed.mod) {
    const mac = isMac();
    if (mac) return event.metaKey;
    return event.ctrlKey;
  }

  return true;
}

// ── Keydown handler ───────────────────────────────────────────────────

function onKeydown(event: KeyboardEvent): void {
  for (const [shortcut, handlers] of registry) {
    const parsed = parseShortcut(shortcut);
    if (matchesShortcut(event, parsed)) {
      event.preventDefault();
      for (const handler of handlers) {
        handler();
      }
    }
  }
}

// ── Listener management ───────────────────────────────────────────────

function attachListener(): void {
  if (!listenerAttached) {
    window.addEventListener('keydown', onKeydown);
    listenerAttached = true;
  }
}

function detachListenerIfEmpty(): void {
  if (listenerAttached && registryIsEmpty()) {
    window.removeEventListener('keydown', onKeydown);
    listenerAttached = false;
  }
}

function registryIsEmpty(): boolean {
  for (const set of registry.values()) {
    if (set.size > 0) return false;
  }
  return true;
}

// ── Test helper (resets module-scoped state) ──────────────────────────

export function _resetForTesting(): void {
  registry.clear();
  if (listenerAttached) {
    window.removeEventListener('keydown', onKeydown);
    listenerAttached = false;
  }
}

// ── Public composable ─────────────────────────────────────────────────

export function useKeyboard(): {
  register: (shortcut: string, handler: Handler) => () => void;
} {
  function register(shortcut: string, handler: Handler): () => void {
    const normalized = shortcut.toLowerCase();

    let handlers = registry.get(normalized);
    if (!handlers) {
      handlers = new Set();
      registry.set(normalized, handlers);
    }
    handlers.add(handler);

    attachListener();

    let removed = false;
    const unregister = (): void => {
      if (removed) return;
      removed = true;

      const set = registry.get(normalized);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          registry.delete(normalized);
        }
      }

      detachListenerIfEmpty();
    };

    // Auto-cleanup when inside a Vue effect scope
    if (getCurrentScope()) {
      onScopeDispose(unregister);
    }

    return unregister;
  }

  return { register };
}
