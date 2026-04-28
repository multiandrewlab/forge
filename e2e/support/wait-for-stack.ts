import { setTimeout as sleep } from 'node:timers/promises';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';
const PREVIEW_BASE = process.env.PREVIEW_URL ?? 'http://localhost:4173';
const MINIO_HEALTH = process.env.MINIO_HEALTH_URL ?? 'http://localhost:9000/minio/health/live';

async function poll(url: string, name: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (res.ok) return;
      lastError = new Error(`${name}: HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await sleep(500);
  }
  throw new Error(
    `[wait-for-stack] ${name} did not become ready at ${url} within ${timeoutMs}ms (last error: ${String(lastError)})`,
  );
}

export async function waitForStack(): Promise<void> {
  await Promise.all([
    poll(`${API_BASE}/api/health`, 'API'),
    poll(MINIO_HEALTH, 'MinIO'),
    poll(`${PREVIEW_BASE}/`, 'Vite preview'),
  ]);
}
