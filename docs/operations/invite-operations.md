# Invite operations

Status: inert runbook. Nothing in this document provisions a vendor resource, creates an invitation, changes spending, or enables live analysis.

## Stored record

Each invite is one Redis hash at `cylon:invite:<code-hmac-sha256>`. The HMAC uses `MAC_INVITE_HASH_PEPPER`, which stays server-side. The record contains only:

| Field | Value |
| --- | --- |
| `id` | Non-identifying operational ID |
| `enabled` | `true` or `false` |
| `expiresAt` | Unix epoch in milliseconds |
| `maxRuns` | Per-invite run quota |
| `usedRuns` | Atomically incremented counter |
| `maxInputCharacters` | Per-request character limit |
| `attempts` | Aggregate counter |
| `successes` | Aggregate counter |
| `failures` | Aggregate counter |
| `inputCharacters` | Aggregate counter |
| `inputTokens` | Aggregate counter |
| `outputTokens` | Aggregate counter |
| `latencyMs` | Aggregate counter |

Never store a raw invite code, email address, person's name, IP address, paper metadata, paper digest, paper text, citation, model finding, reviewer event, or reviewer decision. IP rate-limit identifiers are separately HMAC-digested.

## Approved activation sequence

Do not begin this sequence without approval for both vendor provisioning and production secret injection.

1. Provision Upstash Redis through Vercel Marketplace and set an explicit spending ceiling.
2. Store the Redis credentials and a new 32-character-or-longer HMAC pepper through the approved secret provider. Do not copy them into a repository file or terminal transcript.
3. Validate only the redacted Varlock contract.
4. Generate a high-entropy invite code locally. Show it once to the intended recipient and retain no plaintext copy.
5. Compute its HMAC-SHA-256 server-side and create the Redis hash above with an opaque ID, expiry, and individual quotas.
6. Exercise invalid, valid, exhausted, disabled, and store-failure paths against the preview before enabling production.
7. Set `MAC_INVITE_POLICY=upstash`, `MAC_ANALYSIS_MODE=live`, `MAC_LIVE_ANALYSIS_ENABLED=true`, and `VITE_USE_ANALYSIS_API=true` only in the reviewed live environment.

Local rehearsal does not use this store and must remain available if Redis or OpenAI is unavailable.

## Disable and incident response

- Set an invite's `enabled` field to `false` to revoke that invite without knowing its raw code.
- Set `MAC_LIVE_ANALYSIS_ENABLED=false` for the global shutdown. This leaves local rehearsal intact.
- Treat a Redis failure as a closed live-analysis gate. The API returns `503`; it must never fall back to an unmetered hosted request.
- Operational inspection is limited to the aggregate fields in the table. Do not add request bodies or scientific results to logs while debugging.
