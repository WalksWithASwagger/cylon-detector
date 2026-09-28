# AGENTS.md

How coding agents should work in `WalksWithASwagger/cylon-detector`.
Read this before changing anything. Prefer evidence over guesses.
If a fact is not in this repo, leave a TODO for KK instead of inventing it.

## Purpose

Consciousness Atlas plus MAC Consciousness Bench (Cylon Detector) in one Vite app.

- `/` and `/paper` — inherited Atlas: Kuhn's *Landscape of Consciousness* as an interactive sunburst. Neutral taxonomy explorer, not a verdict engine.
- `/bench` — later instrument. The browser parses and hashes a PDF locally. Default rehearsal is deterministic and offline. Invite-gated server analysis fails closed. A human accepts, revises, or visibly rejects every model demand.

There is no consciousness score, leaderboard, automatic verdict, or synthetic consensus. New exports use canonical `mac-evaluation-run/v2` receipts.

This file does not authorize deploy, vendor spend, licensing, benchmark publication, or research activation. Those stay behind `docs/operations/release-handoff.md` and `agentic/contract.json`.

## Stack

- Node 22.x (`.nvmrc` is `22.12.0`; `package.json` `engines.node` is `22.x`)
- npm (`package-lock.json`; `.npmrc` sets `legacy-peer-deps=true`)
- TypeScript 5.8, Vite 6, SCSS, ECharts 6 (Atlas)
- Bench: `pdfjs-dist`, Zod 4, generated JSON Schemas, Ajv
- Tests: Vitest 4 (`test/**/*.test.ts`), Playwright Chromium (`test/e2e`), Python 3 unittest (`test/agentic`)
- Hosted functions: Vercel (`api/analyze.ts`, `api/submit.ts`, root `middleware.ts`, `vercel.json`)
- Optional, fail-closed: OpenAI, Upstash Redis / ratelimit, Telegram (`/api/submit`), Mixpanel
- Env contract: Varlock 1.11.0 + root `.env.schema`

Default branch is `master`.

## Commands

Only scripts that exist in `package.json` / `scripts/` / CI. There is no Makefile.

```bash
npm install                 # or `npm ci` (what CI uses)
npm run dev                 # Vite on port 8080; mock local rehearsal; no /api/*
npm run dev:full            # same port plus local Vercel functions
npm run type-check
npm run lint                # eslint --max-warnings=0
npm test                    # vitest run, then posttest `npm run test:agentic`
npm run test:watch          # vitest
npm run test:conformance    # vitest run test/conformance
npm run test:e2e            # playwright test && validate:field-evidence
npm run verify              # lint, type-check, validators, tests, build, validate:build
npm run build
npm run preview
```

CI (`.github/workflows/ci.yml`) additionally runs:

```bash
npx playwright install --with-deps chromium
npm exec varlock load --agent --show-all
npm run test:e2e
npm audit --audit-level=moderate
```

`npm run verify` does **not** include Playwright or `npm audit`. Run those separately when the change needs them.

Schema / fixture / data gates (also used by `verify`):

```bash
npm run generate:schemas
npm run generate:fixtures
npm run generate:collaboration-fixtures
npm run validate:data
npm run validate:registry
npm run validate:schemas
npm run validate:collaboration
npm run validate:build
npm run validate:field-evidence
npm run verify:receipt
npm run i18n-check
```

Invite CLI (offline; never writes Redis):

```bash
npm run invites -- dry-run|audit|disable|shutdown
```

Agent-delivery scripts (Python 3, no network required in fixture mode):

```bash
npm run test:agentic
python3 scripts/agentic/issue_lint.py --issue-file test/agentic/fixtures/valid.md --labels agent:ready
python3 scripts/agentic/status_report.py --issues-file test/agentic/fixtures/issues.json --prs-file test/agentic/fixtures/prs.json
python3 scripts/agentic/auto_merge_gate.py --issue-json test/agentic/fixtures/valid-issue.json --pr-json test/agentic/fixtures/review-ready-pr.json
```

Local toolchain preflight (exists as `scripts/validate-local-toolchain.ts`; no npm script wrapper):

```bash
npm exec -- tsx scripts/validate-local-toolchain.ts
```

## Layout

```
api/                 Vercel functions: analyze (invite-gated), submit (Atlas feedback)
src/bench/           MAC Bench UI, PDF parse, mock analysis, v2 receipts, collaboration
src/server/          Hosted analysis, prompts, invite policy (disabled / static / Upstash)
src/components/      Atlas chart, search, theory panel, language and feedback chrome
src/config/          Atlas chart config
src/data/            Theory name mappings
src/pages/           Atlas page styles
src/styles/          Global SCSS
src/types/           Atlas TypeScript types
src/utils/           Routing, i18n, analytics, local form mock
src/shared/          Shared site helpers (`SITE_ORIGIN`)
src/main.ts          Atlas entry
src/paper.ts         Paper-page entry
middleware.ts        Locale / SEO middleware
benchmarks/          Versioned MAC Lab and challenge records
schemas/             Public JSON Schemas
fixtures/            Demo v2 receipt, collaboration packets, conformance kits
indicators/          Draft AI-indicator profile templates
test/                Vitest, Playwright e2e, conformance, agentic Python
agentic/contract.json  Agent delivery contract
docs/                Operations, governance, roadmap, i18n, voice audit, specs
scripts/             Schema/fixture generation, validators, invites, agentic linters
public/              Atlas i18n and theory JSON
```

Public contracts live in `benchmarks/`, `schemas/`, and `indicators/`. The synthetic v2 rehearsal is `fixtures/demo/witness-theory-adjudicated.v2.json`.

## Conventions

- Smallest useful change. Do not "clean up" adjacent files, comments, or dead-looking code.
- TypeScript ESM, `strict: true`. Path aliases: `@/*`, `@/components/*`, `@/config/*`, `@/types/*`.
- Atlas SCSS (`src/styles/`, `src/pages/`) and bench styles (`src/bench/styles.scss`) stay separate.
- Mock local rehearsal is the safe default. Do not flip live-analysis or invite flags to ship a UI change.
- The model drafts. A human accepts, revises, or visibly rejects every demand. Do not add a score, leaderboard, or automatic consensus.
- Receipts: prefer `mac-evaluation-run/v2`. The alpha v1 receipt is an importer fixture only.
- Atlas i18n: meaning-faithful academic translation. Do not "fix" theory JSON shape; match the English source keys and types. Run `npm run i18n-check` after locale edits. Guide: `docs/i18n/TRANSLATION_GUIDE.md`.
- Chart data lives in `src/config/chartConfig.ts` and `src/data/`. Do not treat gitignored `src/data/THEORY.md` as docs.
- Agent work is bounded by `agentic/contract.json` and `docs/AGENTIC-DELIVERY.md`. Touch only the issue Ownership Surface. One lane, one issue.
- Protected paths (auto-merge denied): `agentic/**`, `scripts/agentic/**`, `.github/workflows/**`, env files, credentials, `vercel.json`, `docs/licensing-boundary.md`, `benchmarks/**`, `indicators/**`. Public `.env.schema` is a boundary contract, not a secret file.
- Voice: this is a scientific instrument, not an oracle. See `docs/voice-audit/00-summary.md`.
- Licensing is unresolved. Do not add a LICENSE or claim MIT/Apache without KK. See `docs/licensing-boundary.md`.

## Secrets

Env vars are managed with **Varlock** (`.env.schema` + `varlock load` / `varlock run`) or **Cursor Cloud secrets**. Do not invent another secret store.

Inspect the redacted contract (never dump real values):

```bash
npm exec -- varlock load --agent --show-all
npm exec -- varlock scan --staged
```

Run a command with injected env:

```bash
varlock run -- <command>
```

Never `cat` `.env` / `.env.local`, never `printenv` secrets, never `varlock reveal`, never commit secret-bearing files or real key values. `*.local` is gitignored. `.env` is a protected path even if it appears on disk.

Safe local defaults recorded in `.env.schema` (not secrets):

```text
MAC_ANALYSIS_MODE=mock
MAC_LIVE_ANALYSIS_ENABLED=false
MAC_INVITE_POLICY=disabled
VITE_USE_ANALYSIS_API=false
```

Names in `.env.schema` (values stay out of git and out of this file):

| Name | Notes |
| --- | --- |
| `MAC_ANALYSIS_MODE` | `mock` \| `live` |
| `MAC_LIVE_ANALYSIS_ENABLED` | Global server analysis shutdown |
| `OPENAI_MODEL` | Used only when mode is `live` |
| `OPENAI_API_KEY` | Sensitive, optional; live analysis only |
| `MAC_BENCH_ACCESS_TOKEN` | Sensitive, optional; static invite policy |
| `MAC_INVITE_POLICY` | `disabled` \| `static` \| `upstash` |
| `MAC_INVITE_HASH_PEPPER` | Sensitive, optional; server-side only |
| `MAC_INVITE_MAX_RUNS` | Static-policy default |
| `MAC_INVITE_MAX_INPUT_CHARACTERS` | Static-policy default |
| `MAC_INVITE_IP_REQUESTS` | Per-IP live-analysis window |
| `UPSTASH_REDIS_REST_URL` | Sensitive, optional |
| `UPSTASH_REDIS_REST_TOKEN` | Sensitive, optional |
| `VITE_USE_ANALYSIS_API` | Browser calls `/api/analyze` when true |
| `VITE_MIXPANEL_TOKEN` | Public/optional; Vite inlines `VITE_*`; Mixpanel only in production builds |
| `TG_BOT_TOKEN` | Sensitive, optional; `/api/submit` |
| `TG_CHAT_ID` | Sensitive, optional; `/api/submit` |
| `SITE_URL` | Optional sitemap origin |
| `VERCEL_GIT_COMMIT_SHA` | Platform; inlined as `__SOURCE_COMMIT__` |
| `VERCEL_ENV` | Platform; static invite policy refuses production |
| `CHALLENGE_BASE_REF` | Optional registry history check |
| `NODE_ENV` | Platform / Vite |
| `PROD` | Platform; Mixpanel gate |
| `CI` | Playwright retries |

Unused Atlas leftovers still in the schema (no in-repo reader after `appConfig` was removed): `VITE_APP_TITLE`, `VITE_APP_VERSION`, `VITE_CHART_THEME`, `VITE_CHART_RENDERER`, `VITE_API_BASE_URL`. Do not drop them without a human.

`VITE_*` is public to the browser bundle. Never put a server secret in a `VITE_*` name.

## Deploy

Hosting shape is a Vercel SPA (`vercel.json`: `/`, `/paper`, `/bench`, `/api/*`). That file is not permission to deploy. The package build hook is `npm run vercel-build` (`generate-sitemap` then `build`).

Canonical origin in code is `https://www.consciousnessatlas.com` (`src/shared/site.ts`). Apex `https://consciousnessatlas.com` is citation shorthand only. This repo does not authorize a preview, production promote, or DNS change.

TODO for KK: record the live Vercel team/project id here if agents should name it.

## Do not

From `agentic/contract.json` and the release handoff. Stop and ask KK.

- Deploy or change production / preview settings
- Provision Upstash, OpenAI, Vercel, Telegram, or another vendor; change spend
- Create, expose, rotate, or inject production secrets
- Enable live analysis or invite policy without explicit approval
- Send an upstream licensing request or apply a license
- Publish or mutate a MAC benchmark release
- Write to OSF or another external archive
- Collect human-subject data or run the Provenance Flip study (it is disabled)
- Change repository labels, permissions, or branch protection
- Enable GitHub auto-merge without `agent:auto-merge` and a passing `auto_merge_gate.py`
- Force-push, rewrite shared history, or discard worktrees/stashes without approval
