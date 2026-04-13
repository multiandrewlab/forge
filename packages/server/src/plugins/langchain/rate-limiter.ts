export type AiSlot = {
  controller: AbortController;
  release: () => void;
};

type Entry = { controller: AbortController; startedAt: number; released: boolean };

export type AiRateLimiterOptions = {
  timeoutMs?: number;
  now?: () => number;
};

export class AiRateLimiter {
  private readonly active = new Map<string, Entry>();
  private readonly timeoutMs: number;
  private readonly now: () => number;

  constructor(options: AiRateLimiterOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 60_000;
    this.now = options.now ?? (() => Date.now());
  }

  acquire(userId: string): AiSlot | null {
    const existing = this.active.get(userId);
    if (existing && !existing.released) {
      const age = this.now() - existing.startedAt;
      if (age > this.timeoutMs) {
        existing.controller.abort();
        existing.released = true;
        this.active.delete(userId);
      } else {
        return null;
      }
    }
    const controller = new AbortController();
    const entry: Entry = { controller, startedAt: this.now(), released: false };
    this.active.set(userId, entry);
    return {
      controller,
      release: () => {
        if (entry.released) return;
        entry.released = true;
        if (this.active.get(userId) === entry) {
          this.active.delete(userId);
        }
      },
    };
  }
}
