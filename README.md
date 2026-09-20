# 🧠 Consciousness Atlas

![Consciousness Atlas](./public/banner.png)

An interactive web application that visualizes Robert Lawrence Kuhn's *Landscape of Consciousness* taxonomy and interrogates theory papers with an auditable adversarial bench.

## Cylon Detector / MAC Consciousness Bench skunkworks beta

Open `/bench` to pressure-test a consciousness paper without an account or hosted paper database. The browser parses and hashes the PDF locally. Local rehearsal is deterministic and makes no network request. Invite-gated server analysis sends extracted text only after explicit consent; invite infrastructure fails closed while local rehearsal continues.

The model drafts. A human accepts, revises, or visibly rejects every demand. New exports use the canonical `mac-evaluation-run/v2` receipt with stable Claim Ledger IDs, append-only review events, categorical Stress Fracture results, Witness Protocol cards, and an integrity digest that proves byte stability—not reviewer identity. There is no consciousness score, leaderboard, automatic verdict, or synthetic consensus.

Local browser checkpoints exclude PDF bytes and full extracted text and reconnect only after the original PDF hashes match. Portable files support partial blind review, locked pre-reveal calls, Provenance Deltas, independent contributions, disagreement bundles, preregistration, OSF-ready local packages, RO-Crate provenance, and five-lane AI indicator profiles. Human-subject collection and the live Provenance Flip study are disabled.

Public versioned contracts live in `benchmarks/`, `schemas/`, and `indicators/`. The synthetic v2 rehearsal is `fixtures/demo/witness-theory-adjudicated.v2.json`; the original alpha receipt remains only as a tested v1 importer fixture. Regenerate contracts with `npm run generate:schemas` and `npm run generate:fixtures`.

Local verification:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:e2e
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm audit --audit-level=moderate
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec -- varlock load --agent --show-all
```

- [Product roadmap](docs/roadmap/cylon-detector-roadmap.md)
- [Field-release workplan](docs/roadmap/field-release-workplan.md)
- [Release handoff and gates](docs/operations/release-handoff.md)
- [Research receipts](docs/research/product-research-2026-07-20.md)
- [Voice audit](docs/voice-audit/00-summary.md)

## Tech Stack & Architecture

This repository is one Vite app with two public surfaces.

**Consciousness Atlas** (`/`, `/paper`) is the inherited taxonomy explorer: TypeScript, Vite 6, SCSS, and ECharts 6 sunburst rendering of Kuhn's landscape. Atlas pages keep client-side routing, theory search, and the mystic color system.

**MAC Consciousness Bench** (`/bench`) is the later experimental instrument. The browser parses and hashes a PDF with `pdfjs-dist`, runs a deterministic local mock by default, and writes canonical `mac-evaluation-run/v2` receipts. Zod plus generated JSON Schemas validate requests, runs, collaboration packets, and preregistrations. Optional hosted analysis lives in `api/analyze.ts` and `src/server/`; it fails closed unless live analysis and an invite policy are explicitly enabled.

Shared runtime pieces that actually ship:

- **Frontend**: TypeScript 5.8, Vite 6, ESBuild, `vite-tsconfig-paths`
- **Atlas charts**: ECharts 6 (Sunburst, SVG/Canvas)
- **Bench parsing and contracts**: `pdfjs-dist`, Zod 4
- **Tests**: Vitest 4, Playwright, Python 3 agent-contract tests
- **Schema tooling**: `tsx`, Ajv
- **Hosting shape**: Vercel SPA routes in `vercel.json` (`/`, `/paper`, `/bench`, `/api/*`). Presence of that config is not a deployment or custom-domain claim.

Mock local rehearsal is the safe default. `.env.schema` records:

```text
MAC_ANALYSIS_MODE=mock
MAC_LIVE_ANALYSIS_ENABLED=false
MAC_INVITE_POLICY=disabled
VITE_USE_ANALYSIS_API=false
```

`npm run dev` serves the Vite app on port 8080 and keeps analysis in the browser. It does not start `/api/analyze` or `/api/submit`.

### Optional integrations

These libraries and routes exist in the tree. None of them are configured, provisioned, or authorized by this README.

| Boundary | Code | When it is inert |
| --- | --- | --- |
| OpenAI | `openai` via `src/server/analyzePaper.ts` | `MAC_ANALYSIS_MODE` is not `live`, or `OPENAI_API_KEY` is unset |
| Upstash Redis / ratelimit | `@upstash/redis`, `@upstash/ratelimit` via `src/server/invitePolicyFactory.ts` | `MAC_INVITE_POLICY` is `disabled` (default) or Upstash credentials are absent |
| Telegram | `api/submit.ts` (`TG_BOT_TOKEN`, `TG_CHAT_ID`) | Tokens unset; the Atlas feedback form logs locally instead |
| Mixpanel | `mixpanel-browser` via `src/utils/analytics.ts` (`VITE_MIXPANEL_TOKEN`) | Token unset, or the build is not production |

Invite-gated server analysis sends extracted text only after explicit consent. The analyze route returns 503 while live analysis is off or invite access is unavailable. Local rehearsal continues either way. Vendor provisioning, spend limits, and secret injection stay behind [invite operations](docs/operations/invite-operations.md) and the [release handoff](docs/operations/release-handoff.md).

## Project map

```
api/                      Vercel functions: analyze (invite-gated) and submit (Atlas feedback)
src/bench/                MAC Bench UI, PDF parse, mock analysis, receipts, collaboration
src/server/               Hosted analysis, prompts, invite policy (static / Upstash / disabled)
src/components/           Atlas chart, search, theory panel, language and feedback chrome
src/config/               Atlas app and chart config
src/data/                 Theory name mappings
src/pages/                Atlas page styles
src/styles/               Global SCSS
src/types/                Atlas TypeScript types
src/utils/                Routing, i18n, analytics, local form mock
src/shared/               Shared site helpers
src/main.ts               Atlas entry
src/paper.ts              Paper-page entry
benchmarks/               Versioned MAC Lab and challenge records
schemas/                  Public JSON Schemas for receipts, reviews, and preregistration
fixtures/                 Demo v2 receipt, collaboration packets, conformance kits
indicators/               Draft AI-indicator profile templates
test/                     Vitest, Playwright e2e, receipt/collaboration conformance, agentic Python
agentic/contract.json     Agent delivery contract
docs/AGENTIC-DELIVERY.md  How that contract is used
docs/operations/          Release, invite, receipt, and portable-rehearsal runbooks
docs/governance/          Benchmark publication rules (no published MAC release is implied)
docs/roadmap/             Product and field-release plans
docs/licensing-boundary.md  Inherited Atlas vs original bench licensing notes
scripts/                  Schema/fixture generation and validators
```

Public versioned contracts live in `benchmarks/`, `schemas/`, and `indicators/`. The synthetic v2 rehearsal is `fixtures/demo/witness-theory-adjudicated.v2.json`.

## Development

Requires **Node.js 22.x** (`engines.node` in `package.json`; CI uses Node 22).

```bash
npm install

# Mock local rehearsal (safe default). Vite on port 8080. No API functions.
npm run dev

# Same port, with local Vercel functions for /api/analyze and /api/submit.
# Still mock and fail-closed unless you change the env contract above.
npm run dev:full

npm run type-check
npm test
npm run test:e2e
npm run verify
```

`npm test` runs Vitest, then `test:agentic` (Python 3 unittest under `test/agentic/`). `npm run verify` is the local package gate: type-check, data/registry/schema/collaboration validation, tests, production build, and build validation. CI in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) adds Playwright, Varlock (`npm exec varlock load --agent --show-all`), and `npm audit --audit-level=moderate`.

```bash
npm run generate:schemas
npm run generate:fixtures
npm run build
npm run preview
```

TypeScript path aliases (`@/*`, `@/components/*`, `@/config/*`, `@/types/*`) still apply. ECharts remains a manual chunk. Atlas SCSS and the bench stylesheet stay separate.

Deployment, licensing, MAC benchmark publication, and research activation are not development steps. They stay behind the [release handoff](docs/operations/release-handoff.md), [licensing boundary](docs/licensing-boundary.md), [benchmark governance](docs/governance/benchmark-governance.md), and the field-release workplan. `vercel.json` describes SPA routing and headers only; this README does not authorize a preview or production deploy.

## Chart Configuration

The Atlas sunburst is configured in `src/config/chartConfig.ts`:

- **Data Structure**: Hierarchical theory organization (10 main categories → subcategories → individual theories)
- **Color Palette**: Mystic-themed colors with automatic lightening/desaturation for hierarchy levels
- **Label Positioning**: Dynamic positioning based on device type and hierarchy level
- **Interactive Features**: Tooltips, click handlers, and responsive behavior

## Customization

To modify the Atlas chart:

1. **Data**: Edit `baseData` in `src/config/chartConfig.ts`
2. **Colors**: Modify `mysticPalette` and color utility functions
3. **Styling**: Update SCSS files in `src/styles/` and `src/pages/`
4. **Chart Options**: Modify `getChartOptions()` function
5. **Theory Data**: Add entries to data files in `src/data/`

---

## About the Consciousness Atlas

The Consciousness Atlas is a free web app that transforms Kuhn's 2024 academic paper into an interactive visualization. It presents theories of consciousness organized along a spectrum from most physical (Materialism) to least physical (Idealism), allowing users to explore the field visually and access detailed theory entries.

## Features

- 🧠 **Interactive Sunburst Chart** - Explore Kuhn's consciousness taxonomy in a hierarchical layout
- 📚 **Detailed Theory Entries** - Click any theory to read structured summaries with sources
- 🔍 **Search Functionality** - Find specific theories quickly
- 📱 **Responsive Design** - Optimized for desktop and mobile viewing

## Theory Data

Theories are organized using Kuhn's taxonomy with structured data following the Mind Theory Taxon Schema (MTTS):

- **IdAndClass**: Theory title, summary, thinkers, category classification
- **ConceptualGround**: Ontological status, mind-body relationship, qualia accounts
- **MechanismAndDynamics**: Scope, mechanisms, evidence, evolutionary accounts
- **EmpiricsAndCritiques**: Testability, criticisms, limitations
- **Implications**: Stances on AI consciousness, survival after death, meaning
- **RelationsAndSources**: Related theories and academic references

## Academic Context

Based on Robert Lawrence Kuhn's 2024 paper "A Landscape of Consciousness" published in Progress in Biophysics and Molecular Biology. The Atlas follows Kuhn's "collect and categorize, not assess and adjudicate" approach, providing a neutral visualization of the consciousness research landscape.

## Scope and Disclaimer

This project is an exploratory and educational visualization.  
It does not advocate for any particular theory of consciousness and should not be interpreted as an authoritative scientific classification.

## How to Cite

ConsciousnessAtlas.com by Danilo Znamerovszkij.  
https://consciousnessatlas.com (accessed [date]).

## License status

The upstream README labels Consciousness Atlas as MIT, but this fork currently has no inherited `LICENSE` file. Upstream authorship is preserved and the open-source status of the combined fork should be treated as provisional until that licensing boundary is confirmed. Newly authored MAC Bench materials are prepared for an open release, not represented here as already relicensed.
