import { request, type FullConfig } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SEED_USERS, storageStatePath, type AuthUser } from '../fixtures/auth.js';
import { readE2ESecret, startupProbe } from './server-lifecycle.js';
import { waitForStack } from './wait-for-stack.js';

const API_BASE = process.env.API_URL ?? 'http://localhost:3001';

async function loginAndSave(user: AuthUser): Promise<void> {
  const ctx = await request.newContext({ baseURL: API_BASE });
  const { email, password } = SEED_USERS[user];
  const res = await ctx.post('/api/auth/login', { data: { email, password } });
  if (!res.ok()) {
    const body = await res.text().catch(() => '<unreadable>');
    await ctx.dispose();
    throw new Error(
      `[global-setup] login failed for ${user} (${email}): HTTP ${res.status()}\n${body}`,
    );
  }
  const path = storageStatePath(user);
  mkdirSync(dirname(path), { recursive: true });
  await ctx.storageState({ path });
  await ctx.dispose();
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  await waitForStack();
  const secret = readE2ESecret();
  process.env.E2E_SECRET = secret;
  await startupProbe(API_BASE, secret);
  const users: AuthUser[] = ['e2e_w0', 'e2e_w1', 'e2e_w2', 'e2e_w3', 'alice', 'carol'];
  await Promise.all(users.map(loginAndSave));
}
