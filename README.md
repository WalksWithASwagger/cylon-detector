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
- [Research receipts](docs/research/product-research-2026-07-20.md)
- [Voice audit](docs/voice-audit/00-summary.md)

## Tech Stack & Architecture

- **Frontend**: TypeScript + Vite with ESBuild
- **Charts**: ECharts 6.0 with Sunburst visualization (SVG/Canvas renderers)
- **Styling**: SCSS with responsive design and mobile optimization
- **Deployment**: Vercel with SPA routing and file-based routing
- **Form Submissions**: Telegram Bot API integration for feedback collection
- **Dependencies**: Minimal - only ECharts, Vite, TypeScript, and SCSS

## Technical Features

- 🚀 **Minimal Bundle Size** - Tree-shaking and code splitting (only SunburstChart, SVGRenderer, CanvasRenderer, TitleComponent)
- 📱 **Responsive Design** - Dynamic label positioning and mobile-optimized interactions
- 🎨 **Dynamic Color System** - Mystic-themed palette with automatic hierarchy-based color variations
- 🔄 **SPA Routing** - Client-side routing with history API fallback
- 📊 **High Performance** - SVG renderer for crisp scaling, Canvas fallback
- 🤖 **Telegram Integration** - Form submissions sent directly to Telegram bot

## Form Submissions & Telegram Integration

The feedback form uses a serverless API endpoint (`api/submit.ts`) that forwards submissions to a Telegram bot:

- **API Endpoint**: `/api/submit` - Handles POST requests with form data
- **Telegram Bot**: Sends formatted messages to a designated Telegram chat
- **Error Handling**: Graceful fallback with user feedback
- **Security**: Basic validation and sanitization of form inputs

## Analytics 

Mixpanel integration tracks page views, clicks (buttons, links), and form submissions. Set `VITE_MIXPANEL_TOKEN` environment variable to enable. Tracks only in production.

## Project Structure

```
src/
├── components/          # UI components
│   ├── TheoryChart.ts   # Main sunburst chart component
│   ├── SearchBar.ts     # Theory search functionality
│   ├── FormPopup.ts     # Feedback form modal
│   └── ItemDetailsPanel.ts # Theory detail viewer
├── config/             # Configuration files
│   ├── appConfig.ts     # App settings and environment variables
│   └── chartConfig.ts   # Chart data, colors, and ECharts options
├── data/               # Data files
│   ├── theoryNames.ts   # Theory name mappings
│   └── THEORY.md       # Theory documentation
├── pages/              # Page-specific styles
│   └── theory.scss     # Theory detail page styling
├── styles/             # Global styles
│   ├── main.scss       # Main stylesheet
│   └── _mixins.scss    # SCSS mixins
├── types/              # TypeScript definitions
│   ├── theory.ts       # Mind Theory Taxon Schema (MTTS) interface
│   └── chart.ts        # Chart-related types
├── utils/              # Utility functions
│   ├── routing.ts      # Client-side routing
│   ├── globalState.ts  # Application state management
│   ├── chartUtils.ts   # Chart helper functions
│   ├── slugUtils.ts    # URL slug utilities
│   └── apiMock.ts      # Mock API for development
└── main.ts             # Application entry point
```

## Getting Started

### Prerequisites

- Node.js 22.x
- npm

### Installation

```bash
# Install dependencies
npm install

# Start development server (runs on port 8080)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run type-check
```

## Development

The project uses:
- **Path mapping** for clean imports (`@/components/*`, `@/config/*`, `@/types/*`)
- **Tree-shaking** - Only imports required ECharts components (SunburstChart, SVGRenderer, CanvasRenderer)
- **Code splitting** - ECharts is automatically chunked for better performance
- **SCSS** - Modular styling with mixins and responsive design
- **TypeScript** - Strict typing

## Chart Configuration

The sunburst chart is configured in `src/config/chartConfig.ts`:

- **Data Structure**: Hierarchical theory organization (10 main categories → subcategories → individual theories)
- **Color Palette**: Mystic-themed colors with automatic lightening/desaturation for hierarchy levels
- **Label Positioning**: Dynamic positioning based on device type and hierarchy level
- **Interactive Features**: Tooltips, click handlers, and responsive behavior

## Deployment

The project is configured for Vercel deployment:

```bash
# Build for production
npm run build

# Deploy to Vercel (if using Vercel CLI)
vercel --prod
```

The `vercel.json` configuration includes:
- SPA routing with history API fallback
- Asset caching headers
- Build command configuration

## Performance Features

- **Tree-shaking**: Only loads required ECharts components (SunburstChart, SVGRenderer, CanvasRenderer, TitleComponent)
- **Code splitting**: ECharts automatically chunked for better loading performance
- **Responsive rendering**: SVG renderer for crisp scaling, Canvas fallback
- **Optimized builds**: ESBuild for fast development and production builds
- **Mobile optimization**: Dynamic label visibility and positioning

## Customization

To modify the chart:

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
