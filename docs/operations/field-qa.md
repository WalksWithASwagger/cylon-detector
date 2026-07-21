# Field-release QA evidence

This harness records byte-integrity and current-HEAD evidence for the mock, local-first stranger journey. Its SHA-256 digests detect later byte changes; they do not authenticate a reviewer, independently attest when a run happened, or prove that a Git identity is trustworthy. It does not deploy the application, call a hosted model, validate a production preview, or replace human accessibility and visual review.

## Run the packet

Use Node 22 from a clean checkout:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm ci
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:e2e
```

`test:e2e` runs the full Playwright suite and then validates `test-results/field-evidence/manifest.json`. The field journey uses generated one-page PDFs only. It covers malformed and valid input, citation inspection, a visible human rejection, checkpoint mismatch and matching-source resume, sealed-receipt import, local deletion, keyboard activation of the critical controls, accessible-name and DOM-state proxies, emulated reduced motion, mobile containment, a CSS-zoom layout proxy, and a static report in a JavaScript-disabled browser context.

The local Vite server receives the current 40-character Git commit from `playwright.config.ts`. The exported receipt must contain that same commit. The validator compares the recorded dirty-tree flag with the current `git status`, recomputes the receipt, benchmark, canonical-run, file, and packet digests, and binds the run to the mock analysis channel, browser project, and tested viewports. Release evidence should be generated again from the clean candidate commit.

`generatedAt` is packet content, not trusted freshness evidence. Changing it without recomputing the packet digest is detected. A deliberately resealed packet with an old valid date remains archival byte-integrity evidence and must not be presented as a fresh run.

## Privacy and offline boundary

The application browser context blocks every non-local request during the evidence journey, including requests from new pages in that context. It records request method, URL, and body in memory for the duration of the test. Because this is a telemetry-free mock harness, any attempted analytics, feedback, or storage request at any point fails the run—even during PDF acquisition, and even when it is bodyless, encoded, or contains no recognizable paper marker.

The negative guard test evaluates a bodyless Mixpanel request, a base64 storage request, and a feedback request during acquisition; all must fail. It also requires a changed PDF digest to fail the resume binding. These are test-only records; no paper or request body is written into the evidence manifest.

The harness is always:

- local rehearsal channel;
- deterministic mock analysis;
- synthetic PDF input;
- external-network blocked;
- account-free and secret-free.

Do not use this command as evidence for live analysis or a deployed preview.

## Evidence packet

Generated output is under `test-results/field-evidence/`:

- `manifest.json` — machine-readable checks, file bindings, current HEAD, dirty-tree state, packet digest, and canonical-run digest;
- `synthetic-source.pdf` — the generated source bytes bound to the receipt;
- `canonical-receipt.json` — the exported run whose integrity and benchmark digests are recomputed;
- `methods-evidence.html` — the static report bound to the canonical run and opened without JavaScript;
- `desktop.png` — desktop visual evidence with validated PNG dimensions;
- `mobile.png` — mobile visual evidence with validated PNG dimensions and a distinct path.

`test-results/` is gitignored. A maintainer may deliberately copy a reviewed packet into a tracked fixture location in a separately scoped change; never force-add generated output from an ordinary run.

The validator fails closed for a mismatched or abbreviated commit, a dirty-state lie, missing or failed checks, non-mock analysis, non-synthetic input, changed or missing bound files, receipt/run/benchmark/packet digest mismatches, duplicate file paths, incorrect PNG dimensions, forbidden telemetry or storage traffic, unsafe paths, or absent mobile and CSS-zoom proxy evidence. It can also be run directly:

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run validate:field-evidence
```

## Human review still required

Before promoting a packet or approving a preview, a maintainer must inspect both screenshots and complete the interface with:

- a real screen reader;
- keyboard-only navigation, including focus order and focus visibility;
- browser-native 200 percent zoom;
- reduced-motion enabled at the operating-system level;
- the approved desktop and mobile browsers.

The automated ARIA, `:focus-visible`, media-emulation, scroll-width, and CSS-zoom checks are explicitly proxies. Record visual or assistive-technology problems as reproducible issues tied to the tested commit. Preview testing, deployment, live analysis, and publication remain separate approvals.
