# Spec: Cylon Detector Skunkworks v2

## Objective

Turn the alpha into a public, account-free, local-first website for adversarial review of consciousness papers. A visitor can parse a PDF locally, explicitly authorize transient analysis, inspect source-page evidence, make the final human calls, save and resume locally, export readable reports and a tamper-evident receipt, and exchange blind or independent review artifacts without a hosted paper database.

Success is evidence legibility and reproducibility, not a consciousness score. The model drafts an interrogation. Humans own every scientific conclusion and every release of a benchmark.

## Tech stack

- Vite 6, vanilla TypeScript, SCSS, and Vercel Functions
- Zod as the runtime contract source and generated JSON Schema for public artifacts
- PDF.js for browser-local parsing and evidence rendering
- IndexedDB for explicit local checkpoints that exclude PDF bytes and full extracted text
- OpenAI Responses API with `store: false` for the hosted analysis adapter
- Upstash Redis and rate limiting behind injectable interfaces; unavailable unless configured
- Vitest for contract and unit tests; Playwright Chromium for browser flows
- Node.js 22 and npm

## Commands

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run type-check
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm test
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:e2e
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm audit --audit-level=moderate
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec varlock load --agent --show-all
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec varlock scan --staged
```

## Project structure

```text
api/                         Vercel HTTP boundaries
benchmarks/                  immutable benchmark releases
benchmarks/challenges/       versioned challenge proposals and releases
schemas/                     generated public JSON Schemas
src/bench/                   browser workflow, contracts, artifacts, reports
src/server/                  transient analysis, invite policy, local adapters
fixtures/                    synthetic public contract examples
test/                        contract, API, privacy, and browser verification
docs/                        method, roadmap, research, licensing, operations
```

## Code style

Prefer small pure functions and explicit domain names over frameworks or generic event systems.

```ts
export function finalValue(event: ReviewEvent): string | undefined {
  if (event.decision === 'accepted') return event.aiValue
  if (event.decision === 'revised') return event.humanValue
  return undefined
}
```

Validate only at file, browser, provider, and HTTP boundaries. Preserve immutable input records and derive reports from the canonical run artifact.

## Public contracts

- `mac-benchmark-definition/v2`: generic challenge slugs, exact challenge versions, fixed five demands, explicit lifecycle.
- `mac-challenge-definition/v2`: assumptions, confounds, target commitments, empirical anchors, authors, and change-my-mind observation.
- `mac-evaluation-run/v2`: source receipt, analysis manifest, claim ledger, append-only human review events, privacy receipt, categorical results, witness protocols, and integrity digest.
- `blind-review-packet/v1`, `review-contribution/v1`, `review-bundle/v1`, and `provenance-envelope/v1`.
- `mac-preregistration/v1`, theory bundle, replay comparison, AI indicator bundle, and disabled study protocol schemas.
- `POST /api/analyze` keeps bearer authorization and returns structured `401`, `413`, `429`, and `503` errors.

Existing v1 artifacts remain importable and normalize into the v2 internal model. New exports use v2 only.

## Data boundaries

- PDF bytes and full extracted text stay in browser memory.
- A local checkpoint contains paper hashes and metadata, analysis output, citations, and human review events, but not PDF bytes or full page text.
- Resume requires reselecting a PDF whose byte and text hashes match the checkpoint.
- Live analysis sends extracted text only after explicit consent.
- Invite storage contains hashed code identifiers, policy, counters, and aggregate token usage only.
- Logs must not contain paper identity, hashes, text, findings, reviewer decisions, raw invite codes, or access tokens.
- Bench workflow analytics remain disabled.

## Testing strategy

- Red-green-refactor for schemas, converters, invite policy, checkpoints, report projections, blind-review transforms, preregistration, and replay logic.
- Contract tests validate every generated JSON Schema and synthetic fixture.
- API tests use injectable stores and analyzers, including concurrency and fail-closed behavior.
- Browser tests cover local analysis, checkpoint resume, reports, blind/reveal, artifact exchange, keyboard operation, and mobile layout.
- Static validators reject scores, paper telemetry, mutable published challenges, secret leakage, and unsafe study activation.

## Boundaries

Always:

- preserve the current dirty worktree and unrelated inherited Atlas behavior;
- keep the app functional after every slice;
- use Node 22 for final verification;
- keep new experimental features disabled by default;
- distinguish an integrity digest from an identity signature.

Ask first:

- commit, push, PR, preview or production deployment;
- Upstash provisioning, OpenAI or Vercel spending/configuration;
- applying or publishing a licensing map;
- external messages, OSF writes, or custom domains;
- collecting human data or activating deceptive trials.

Never:

- read or print local secret files;
- persist full paper text on the server or in checkpoints;
- assign a consciousness score or automatic human verdict;
- represent a digest as proof of reviewer identity;
- activate human-subject or welfare-relevant protocols without approval.

## Success criteria

- All six local outcome gates in the approved plan have implemented, testable artifacts.
- Anonymous local use remains available if every external service is absent.
- Hosted analysis fails closed without a valid invite policy store.
- One canonical v2 receipt deterministically generates the ledger, Lab Note, Methods report, CSV, stress map, and witness protocols.
- Blind and independent reviews travel entirely through portable artifacts.
- Research and experimental modules are reproducible but external writes and data collection are disabled.
- Full verification, security scan, privacy inspection, and desktop/mobile visual QA pass.

## Open questions

None for local implementation. External vendor, licensing, deployment, publication, and research approvals remain explicit handoff gates.
