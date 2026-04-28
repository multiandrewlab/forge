import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

export function isE2EFlagSet(value: string | undefined): boolean {
  return value?.trim() === '1';
}

type Env = {
  NODE_ENV?: string;
  ENABLE_TEST_ROUTES?: string;
  LLM_PROVIDER?: string;
  E2E_MODE?: string;
};

const DEV_OR_TEST = new Set(['development', 'test']);

export function assertProductionGuards(env: Env): void {
  const nodeEnv = env.NODE_ENV?.trim();
  const isDevOrTest = nodeEnv !== undefined && DEV_OR_TEST.has(nodeEnv);
  if (isDevOrTest) return;

  const offenders: string[] = [];
  if (isE2EFlagSet(env.ENABLE_TEST_ROUTES)) offenders.push('ENABLE_TEST_ROUTES=1');
  if (env.LLM_PROVIDER?.trim() === 'mock') offenders.push('LLM_PROVIDER=mock');
  if (isE2EFlagSet(env.E2E_MODE)) offenders.push('E2E_MODE=1');

  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start: NODE_ENV=${nodeEnv ?? '<unset>'} is not development/test, ` +
        `but the following test-mode flags are set: ${offenders.join(', ')}. ` +
        `This combination is unsafe and would expose destructive endpoints.`,
    );
  }
}

export function generateE2ESecret(path: string): string {
  const secret = randomBytes(32).toString('hex');
  writeFileSync(path, secret, { mode: 0o600, flag: 'w' });
  return secret;
}
