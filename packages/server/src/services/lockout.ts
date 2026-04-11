const MAX_FAILURES = 10;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

interface LockoutEntry {
  failures: number;
  lockedUntil: number | null;
}

export interface LockoutResult {
  locked: boolean;
  remainingMs?: number;
}

export class LockoutService {
  private readonly entries = new Map<string, LockoutEntry>();

  checkLockout(email: string): LockoutResult {
    const entry = this.entries.get(email);
    if (!entry || entry.lockedUntil === null) {
      return { locked: false };
    }

    const remaining = entry.lockedUntil - Date.now();
    if (remaining <= 0) {
      // Lock has expired — clear the entry
      this.entries.delete(email);
      return { locked: false };
    }

    return { locked: true, remainingMs: remaining };
  }

  recordFailure(email: string): void {
    const entry = this.entries.get(email) ?? { failures: 0, lockedUntil: null };
    entry.failures += 1;

    if (entry.failures >= MAX_FAILURES) {
      entry.lockedUntil = Date.now() + LOCKOUT_DURATION_MS;
    }

    this.entries.set(email, entry);
  }

  resetFailures(email: string): void {
    this.entries.delete(email);
  }
}

/** Singleton instance used across the application */
export const lockoutService = new LockoutService();
