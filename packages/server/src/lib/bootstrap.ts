import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertProductionGuards, generateE2ESecret, isE2EFlagSet } from './env-guards.js';
import { assertCfEnv } from './cf-stream-config.js';

export type BootHooks = {
  onError?: (msg: string) => void;
  onExit?: (code: number) => void;
  runnerTemp?: string;
};

export function runBootGuards(env: NodeJS.ProcessEnv, hooks: BootHooks = {}): void {
  const onError = hooks.onError ?? ((msg: string) => console.error(msg));
  const onExit = hooks.onExit ?? ((code: number) => process.exit(code));

  try {
    assertProductionGuards(env);
    assertCfEnv(env);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    onError(msg);
    onExit(1);
    return;
  }

  if (isE2EFlagSet(env.ENABLE_TEST_ROUTES)) {
    const dir = hooks.runnerTemp ?? env.RUNNER_TEMP ?? tmpdir();
    const secretPath = join(dir, 'forge-e2e-secret');
    const secret = generateE2ESecret(secretPath);
    env.E2E_SECRET = secret;
  }
}
