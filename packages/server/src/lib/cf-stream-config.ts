/**
 * Production environment validation for Cloudflare Stream configuration.
 *
 * Used at server startup (and by the createCloudflareStream factory) to fail loudly
 * when production is missing a required CF_* var or has MOCK_CF_STREAM=1 set. The
 * spec (§10) requires that production NEVER fall back to the mock service.
 */

const REQUIRED = [
  'CF_ACCOUNT_ID',
  'CF_STREAM_API_TOKEN',
  'CF_STREAM_WEBHOOK_SECRET',
  'CF_STREAM_SIGNING_KEY_ID',
  'CF_STREAM_SIGNING_KEY_PEM',
  'CF_STREAM_CUSTOMER_SUBDOMAIN',
] as const;

export function assertCfEnv(env: NodeJS.ProcessEnv | Record<string, unknown>): void {
  if (env.NODE_ENV !== 'production') return;
  if (env.MOCK_CF_STREAM === '1') {
    throw new Error('MOCK_CF_STREAM=1 is forbidden in NODE_ENV=production');
  }
  const missing = REQUIRED.filter((k) => {
    const v = (env as Record<string, unknown>)[k];
    return v === undefined || v === null || String(v).length === 0;
  });
  if (missing.length) {
    throw new Error(`Missing required CF Stream env vars in production: ${missing.join(', ')}`);
  }
}
