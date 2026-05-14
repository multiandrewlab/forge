# Video posts (issue #102)

Bruno regression coverage for the video-posts feature: upload-URL minting, playback/poster URL emission, AI suggestions + re-run, vote/bookmark/comment, visibility flip, transcript-based search, and the Cloudflare Stream webhook (see `bruno/cf-stream/`).

## Seeded fixtures (`scripts/seed.sql`, pinned in `bruno/environments/local.bru`)

| Variable                 | UUID / value                                         | Owner            | Notes                                                                                |
| ------------------------ | ---------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------ |
| `videoPostId`            | `c0…088`                                             | testuser         | Public, ready video. Transcript contains `xenophontic_observability` (D-weight FTS). |
| `privateVideoPostId`     | `c0…097`                                             | bruno_other_user | Private, ready video with `playback_requires_signed_url=true`.                       |
| `searchTranscriptPostId` | `c0…096`                                             | testuser         | Snippet post whose TITLE contains `xenophontic_observability` (A-weight FTS).        |
| `videoRevisionId`        | `d0…088`                                             | testuser         | Initial revision of `videoPostId`.                                                   |
| `videoSuggestionId`      | `f0…088`                                             | —                | Seed AI run row attached to `videoPostId`.                                           |
| `bruno_other_user`       | `a0…098` / `bruno_other@example.com` / `password123` | —                | Owner of `privateVideoPostId`. Used by inline-login files only.                      |
| `cfStreamWebhookSecret`  | `test-webhook-secret-do-not-use-in-prod`             | —                | HMAC-SHA256 secret for `cf-stream/*` files. Matches `.env.example` value.            |

The server MUST be started with `CF_STREAM_WEBHOOK_SECRET` matching `cfStreamWebhookSecret` (the Bruno CI workflow sets both to the same literal). `MOCK_CF_STREAM=1` puts the CF Stream service in deterministic in-memory mode, and `LLM_PROVIDER=mock` routes AI calls to `ChatMock` for reproducibility.

## State mutation & re-runability

A few files mutate seeded state. To re-run the suite locally from a known baseline, restore state via `psql`:

```bash
psql "$DATABASE_URL" -f scripts/seed.sql
# The seed uses ON CONFLICT DO NOTHING, so existing mutations on seeded rows
# are NOT undone. If a previous run left mutations, force-reset:
psql "$DATABASE_URL" -c "
  UPDATE post_videos SET pending_cf_uid = NULL, playback_requires_signed_url = false
    WHERE post_id = 'c0000000-0000-0000-0000-000000000088';
  UPDATE posts SET visibility = 'public'
    WHERE id = 'c0000000-0000-0000-0000-000000000088';
"
```

Mutating files (with restore strategy):

- `request-upload-url-replace.bru` (seq 4) — sets `pending_cf_uid`. Cleared by the manual `UPDATE post_videos SET pending_cf_uid = NULL …` above.
- `change-visibility-public-to-private.bru` (seq 16) — flips `videoPostId` to private; the file's own `post-response` flips it back to public in the same run. If the post-response fails, the manual `UPDATE posts SET visibility = 'public' …` restores the seed state.

## File index

WU7a (seq 1–13) covers the basic CRUD + AI suggestions paths. WU7b (seq 14–18, and the entirety of `bruno/cf-stream/`) covers the complex paths: inline-login, AI re-run (mock-mode quirk documented inside the file), visibility-flip SAGA, transcript-vs-title FTS ranking, and HMAC-signed webhook verification.

## Pattern: inline-login as a non-testuser owner

`bruno/collection.bru` bootstraps `testuser` into the `accessToken` runtime var. To act as a DIFFERENT user for a single file, log in inline and store the token in a SEPARATE variable so the shared `accessToken` stays valid for the rest of the run. Reference: `request-playback-private-owner.bru` (seq 14) and `bruno/posts/get-private-post-as-owner.bru`.

```text
script:pre-request {
  const axios = require("axios");
  const baseUrl = bru.getEnvVar("baseUrl");
  const loginRes = await axios.post(`${baseUrl}/api/auth/login`, {
    email: bru.getEnvVar("bruno_other_user_email"),
    password: bru.getEnvVar("bruno_other_user_password"),
  });
  bru.setVar("brunoOtherToken", loginRes.data.accessToken);
}

auth:bearer {
  token: {{brunoOtherToken}}
}
```

Why a separate variable: the collection-root pre-request only logs in if `accessToken` is unset; OVERWRITING `accessToken` mid-run would persist for every subsequent file and break files that rely on testuser. A dedicated `*Token` var keeps the two identities cleanly separated.

## Pattern: HMAC-signed webhook (`bruno/cf-stream/*.bru`)

The Cloudflare Stream webhook route (`POST /api/cf-stream/webhook`) verifies an HMAC-SHA256 signature header (`Webhook-Signature: t=<unix_ts>,v1=<hex>`) over `${ts}.${rawBody}`. To produce a valid signature in Bruno:

1. **Use `crypto-js`** (bundled in the QuickJS sandbox via `require('crypto-js')`). Do NOT `require('crypto')` — Node's built-in is blocked by the safe sandbox.
2. **Sign the EXACT bytes Bruno will send**. Build the body object in `pre-request`, call `JSON.stringify` yourself to know the canonical form, compute the HMAC over that string, and call `req.setBody(obj)` so Bruno re-serializes to the same canonical form (insertion order, no whitespace).
3. **Set the header** with `req.setHeader('Webhook-Signature', ...)`.

```text
script:pre-request {
  const CryptoJS = require("crypto-js");
  const ts = Math.floor(Date.now() / 1000);
  const body = { id: `bru-evt-${ts}`, type: "video.ready", uid: "seedcfuid_88", data: { readyToStream: true } };
  const rawBody = JSON.stringify(body);
  const secret = bru.getEnvVar("cfStreamWebhookSecret");
  const sig = CryptoJS.HmacSHA256(`${ts}.${rawBody}`, secret).toString(CryptoJS.enc.Hex);
  req.setBody(body);
  req.setHeader("Webhook-Signature", `t=${ts},v1=${sig}`);
}
```

For the **idempotency / duplicate-send** assertion (`webhook-duplicate.bru`), the second send must reuse the EXACT raw bytes from the first send so the HMAC stays valid. Use `bru.sendRequest({…, data: rawBody})` (axios passes string `data` through untouched — do not `transformRequest`, as functions don't survive the sandbox marshaller). See the file's docs block for the full rationale.

For the **invalid-signature** assertion, set a static `Webhook-Signature` header in the `headers` block (64 hex chars of `0` is a length-matched but wrong digest); the timestamp can be anything because the route runs the signature check BEFORE the freshness check.

For the **stale-timestamp** assertion, sign correctly but use `ts = Math.floor(Date.now() / 1000) - 600` so the freshness check (`|now - t| > 5 * 60`) fires.
