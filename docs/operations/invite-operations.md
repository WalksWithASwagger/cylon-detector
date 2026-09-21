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

The Redis key is `cylon:invite:` plus HMAC-SHA-256 of the raw code keyed by `MAC_INVITE_HASH_PEPPER`. That construction is exported from `src/server/invitePolicy.ts` as `digestInviteCodeSync` and `inviteStorageKey` and is the same digest the live authorizer uses.

## Dry-run provisioning and audit

The default operator tool is offline. It prepares or inspects hashed records and cannot send a live invite, open a Redis connection, or write a vendor payload.

```bash
# Prepare a hashed record. Pepper comes from a Varlock-loaded environment.
# Generated codes print once on TTY stderr only.
# --expires-at must be in the future. A past timestamp mints an immediately expired invite.
varlock run -- npm run invites -- dry-run \
  --id mac-lab-pilot \
  --expires-at 2027-12-31T00:00:00.000Z \
  --max-runs 5 \
  --max-input-characters 200000 \
  --handoff-stderr

# Accept an existing high-entropy code from stdin. Never pass --code or --pepper.
printf '%s' "$EXISTING_CODE" | varlock run -- npm run invites -- dry-run \
  --id mac-lab-pilot \
  --expires-at 2027-12-31T00:00:00.000Z \
  --code-stdin

# Audit only safe configuration and aggregate counters.
printf '%s' "$PREPARED_JSON" | npm run invites -- audit --record-stdin

# Disable one invite from its hashed dry-run record. The raw code is not required.
printf '%s' "$PREPARED_JSON" | npm run invites -- disable --record-stdin

# Preview the global hosted-analysis shutdown. Local rehearsal stays available.
npm run invites -- shutdown
```

Stdout is the durable JSON plan or audit report. It contains the opaque ID, enabled flag, epoch expiry, quotas, zeroed or aggregate counters, and—for prepare/disable only—the hashed Redis key. It never contains the raw code, pepper, IP address, paper identity, source digest, findings, citations, or review decisions.

Plaintext lifetime:

- Generate a code inside the process or accept it on stdin. `--code` and `--pepper` are rejected so secrets never enter process arguments.
- Do not write the raw code to a config file, Redis payload, or log.
- Generating a code requires `--handoff-stderr` and a TTY stderr. The code is printed once on that stream. Do not redirect it to a file. Headless runs must pass an existing code with `--code-stdin`.
- After the recipient has the code, forget it. Later disable and audit operations use the opaque ID and hashed record only.

Apply mode is absent. `--apply`, `--commit`, `--write`, `--write-redis`, `--output`, and `--redis` fail closed. Shipping a mutating apply path requires a separately reviewed design after vendor provisioning is approved.

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

These procedures are testable without the raw invite code.

- **Single-invite disable:** run `npm run invites -- disable --record-stdin` against the hashed dry-run record (or, after an approved apply design, set that record's `enabled` field to `false`). The Redis key is the HMAC, so the raw code is not required.
- **Global shutdown:** run `npm run invites -- shutdown` to preview, then set `MAC_LIVE_ANALYSIS_ENABLED=false` in the reviewed host environment. Local rehearsal stays available.
- Treat a Redis failure as a closed live-analysis gate. The API returns `503`; it must never fall back to an unmetered hosted request.
- Operational inspection is `npm run invites -- audit --record-stdin`. The report includes only the configuration and aggregate counters in the table. Do not add request bodies or scientific results to logs while debugging.
