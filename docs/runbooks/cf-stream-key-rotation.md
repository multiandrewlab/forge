# CF Stream signing-key rotation

This runbook documents the procedure for rotating the Cloudflare Stream signing key used to mint short-lived playback JWTs for private videos (see issue #102, spec §8 + §12).

Cloudflare Stream supports multiple active signing keys per account. Routine rotation uses an overlap window so in-flight playback sessions are not interrupted. Emergency revocation is also documented below.

## Routine rotation (planned)

Use this procedure for scheduled rotation (e.g. quarterly, or after a developer with key access leaves the team).

1. **Generate a new signing key** in the Cloudflare dashboard:
   - Navigate to **Stream → Settings → Signing keys → Create signing key**.
   - Copy the new key ID and PEM. Treat the PEM as a production secret — it is the JWT signing material.

2. **Update production environment variables** with the NEW values:
   - `CF_STREAM_SIGNING_KEY_ID` = new key ID
   - `CF_STREAM_SIGNING_KEY_PEM` = new PEM (full multi-line block, including `-----BEGIN/END PRIVATE KEY-----` markers)
   - Deploy. The server boot guard (`assertCfEnv` invoked by `runBootGuards` in `packages/server/src/lib/bootstrap.ts`) will refuse to start if either is missing in `NODE_ENV=production`.

3. **Overlap period (≥ 1 hour).** Cloudflare retains the previous signing key for already-minted JWTs until their `exp` claim passes. Because Forge mints tokens with short TTLs (see `mintPlaybackToken` in `packages/server/src/services/cloudflare-stream.ts`):
   - New playback URLs are signed with the new key from this point forward.
   - Existing playback URLs (already in user browsers) continue to play until their `exp` claim passes.
   - The Forge client's session-refresh path will request a new playback URL on token expiry; the new URL will be signed with the new key transparently.

4. **Revoke the old key** in the Cloudflare dashboard once at least one hour has elapsed since deploy. Path: **Stream → Settings → Signing keys → [old key] → Revoke**.

5. **Verify** by tailing server logs for any `CF_UPSTREAM_ERROR` lines emitted by the playback route. None expected. Spot-check a private video playback in a fresh browser session.

## Emergency revocation (key leaked)

Use this procedure when the signing key PEM has been exposed (committed to a public repo, leaked in logs, shared in a screenshot, etc.). Skip the overlap window to immediately invalidate all outstanding signed URLs.

1. **Revoke the old key in the Cloudflare dashboard first.** This invalidates every JWT signed with that key, including in-flight playback sessions.

2. **Generate a new signing key** and update env vars exactly as in steps 1–2 of the routine procedure. Deploy.

3. **Communicate user impact.** Mid-flight playback sessions will fail with token-refresh errors. The Forge client surfaces a "session refreshing" toast and prompts the user to reload. Most users will recover automatically; some may need to refresh the page manually.

4. **Audit the leak source.** Check `cf-stream.webhook.rejected` and any unusual `video.pipeline.deferred-error` lines in the audit log for signs of abuse during the exposure window.

5. **Rotate any other credentials that may have been exposed alongside the key.** Common co-exposures: `CF_STREAM_API_TOKEN`, `CF_STREAM_WEBHOOK_SECRET`. If in doubt, rotate them all and redeploy.

## Verification commands

After any rotation, verify the deploy with these checks against the running server:

```bash
# 1. Server started cleanly with new env (no boot-guard failure)
kubectl logs <pod> | grep -E "(refusing to start|MOCK_CF_STREAM|Missing required CF)"
# Expected: no matches

# 2. New playback URL is being minted with the new key id
# (The minted JWT's `kid` header claim equals CF_STREAM_SIGNING_KEY_ID.)
curl -s "https://forge.example.com/api/posts/<id>/video/playback" \
  -H "Authorization: Bearer $TOKEN" \
  | jq -r .playbackUrl \
  | awk -F/ '{print $4}' \
  | cut -d. -f1 | base64 -d 2>/dev/null | jq .kid
# Expected: matches the NEW CF_STREAM_SIGNING_KEY_ID

# 3. No CF_UPSTREAM_ERROR lines in the last hour
kubectl logs --since=1h <pod> | grep CF_UPSTREAM_ERROR
# Expected: no matches
```

## Field reference

| Env var                        | Purpose                                                   | Rotation cadence               |
| ------------------------------ | --------------------------------------------------------- | ------------------------------ |
| `CF_STREAM_SIGNING_KEY_ID`     | JWT `kid` header; identifies which key signed the URL     | Quarterly (or on leak)         |
| `CF_STREAM_SIGNING_KEY_PEM`    | RS256/Ed25519 private key used to sign playback JWTs      | Quarterly (or on leak)         |
| `CF_STREAM_API_TOKEN`          | Bearer token for CF API calls (upload, delete, GET asset) | Rotate independently as-needed |
| `CF_STREAM_WEBHOOK_SECRET`     | HMAC secret CF uses to sign webhook callbacks             | Rotate independently as-needed |
| `CF_ACCOUNT_ID`                | CF account UUID — public-ish, does not need rotation      | Static                         |
| `CF_STREAM_CUSTOMER_SUBDOMAIN` | `customer-<id>.cloudflarestream.com` host                 | Static                         |

## Related code

- Boot validation: `packages/server/src/lib/cf-stream-config.ts` (`assertCfEnv`)
- Boot wiring: `packages/server/src/lib/bootstrap.ts` (`runBootGuards`)
- JWT minting: `packages/server/src/services/cloudflare-stream.ts` (`mintPlaybackToken`)
- Logger redaction: `packages/server/src/logger.ts` (`createLogger` — `playbackUrl`, `signingKeyPem` redacted)
- Spec: `docs/superpowers/specs/2026-05-12-video-posts-design.md` §8 (visibility), §12 (config), §14 (audit logging)
