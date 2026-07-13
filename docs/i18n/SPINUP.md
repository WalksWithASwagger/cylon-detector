# i18n — Next-Locale Spin-Up Runbook

One doc with everything needed to translate the remaining languages. The
software/architecture phase (Part A of the plan) is **done and shipped**;
what's left is pure content production, one locale at a time. Adding a locale
is a content-only change — no code edits except the two-line shipped-locale
gate (step 5 below).

---

## 1. Current state (as of Malay completion)

**Shipped (10):** `en` (source) · `es` `fr` `de` `uk` `hi` `ms` `zh-CN` `zh-TW` `ar`

**Remaining (14):** `it` `nl` `pl` `pt-BR` `pt-PT` `ru` `tr` `he` `bn` `ja` `ko` `id` `vi` `th`

Source of truth for progress: `docs/i18n/progress/STATUS.json`. On any resume,
read it first; the first non-`done` locale is the next one. A locale is only
"shipped" once it also appears in `AVAILABLE_LOCALES` (see step 5).

Per-locale deliverables (all under known paths):
- `public/i18n/ui/{locale}.json`   — ~110 UI strings
- `public/i18n/taxonomy/{locale}.json` — categories/subcategories/shortLabels/fullNames
- `public/i18n/seo/{locale}.json`  — title/description/ogTitle/ogDescription
- `public/data/{locale}/*.json`    — 210 theory content files
- glossary `renderings` entry for the locale, in `docs/i18n/glossary.json`

Everything else (routing, middleware hreflang, RTL, OG-locale map, sitemap
hreflang) already handles all 24 `SUPPORTED_LOCALES` generically — no per-locale
code. `middleware.OG_LOCALE_MAP` already has all 24; `RTL_LOCALES` already has
`he`.

---

## 2. The proven pipeline (what worked for the last 9 locales)

Two steps per locale, in order:

### Step A — UI + taxonomy + SEO dicts + glossary seed (1 agent)

One agent translates the three small dicts and seeds the glossary. It must:
- Read `docs/i18n/TRANSLATION_GUIDE.md` and `docs/i18n/glossary.json` first.
- Translate `public/i18n/ui/en.json` → `public/i18n/ui/{locale}.json`, keeping
  the **exact key set**; preserve `.html` values' tags/attributes/URLs; keep
  `{placeholders}` verbatim. `paper.*` keys: n/a (paper.html is untranslated).
- Translate `public/i18n/taxonomy/en.json` → `.../taxonomy/{locale}.json`
  (same keys). These strings are the on-screen chart labels + tooltips.
- Translate `public/i18n/seo/en.json` → `.../seo/{locale}.json`.
- Add a `"{locale}": "..."` rendering to **every** term and field_label in
  `docs/i18n/glossary.json` (this seeds terminology consistency for step B).
- Validate: `node scripts/i18n-check.js {locale}` → 0 hard failures.

### Step B — 210 theory content files (12-agent workflow)

Use the Workflow tool. The reusable template lives at:
`~/.claude/projects/-Users-dan-Repositories-c-atlas/<session>/workflows/scripts/translate-ms-theories-wf_*.js`

To adapt for a new locale, copy that script and change only:
1. `meta.name` / `meta.description` — swap `ms`/Malay.
2. In `buildPrompt`: the locale code `ms` → `{locale}`, the language name
   ("formal academic Bahasa Melayu") → target language + register note (see §4),
   and the script/surname convention line (see §4 — Latin-script vs. own-script).
3. The `--files` in the validation command and the write dir
   `public/data/ms/` → `public/data/{locale}/` are already parameterized off the
   locale string in the prompt — just make sure the write-path locale matches.

The `ALL` filename list (210 real on-disk filenames) is embedded in the
template and is **identical for every locale** — do not regenerate it. It's the
resolved on-disk names, NOT chart leaf names (see §6). Same 12-way split each
time.

Run it: `Workflow({ scriptPath: "<the copied script>" })`. 12 agents translate
~18 files each and self-validate. Expect `{groups:12, done:12}`, 0 hard
failures.

---

## 3. Finalization checklist (after step B, per locale)

```bash
# 1. Consolidated validation — expect 0 hard failures (warnings are fine)
node scripts/i18n-check.js {locale}

# 2. English-left scan — every theory summary must differ from English source
#    (catches silently-skipped files). Was clean on all shipped locales.

# 3. Confirm all 210 files present
ls public/data/{locale}/*.json | wc -l   # -> 210

# 4. Regenerate sitemap (auto-gates to shipped locales)
npm run generate-sitemap

# 5. Type-check + build
npm run type-check && npm run build
```

Then edit **STATUS.json**: set the locale's `ui_dictionary` → `done`, all 18
`theory_chunks` → `done`, `qa_layer1` → `passed`.

Then the **shipped-locale gate — TWO places, keep in sync** (both must include
the new locale or middleware redirects it to English):
- `src/shared/site.ts` → `AVAILABLE_LOCALES` array
- `index.html` → inline `var AVAILABLE = [...]` in the detection `<script>`

Run `npm run generate-sitemap` **after** updating the gate (it reads shipped
locales). Order that worked: update both gate arrays → generate-sitemap →
type-check → build.

---

## 4. Per-locale register notes (from TRANSLATION_GUIDE §Locale-specific)

Feed the right note into both step A and step B prompts:

| Locale | Register note | Script / surnames |
|---|---|---|
| `it` | Standard academic Italian | Latin — keep surnames verbatim |
| `nl` | Standard academic Dutch, formal register | Latin — verbatim |
| `pl` | Academic Polish | Latin — verbatim |
| `pt-BR` | Brazilian academic terminology; avoid Portugal-specific phrasing | Latin — verbatim |
| `pt-PT` | European Portuguese academic; avoid Brazilian colloquialisms. Must be meaningfully distinct from pt-BR | Latin — verbatim |
| `ru` | Academic Russian | Cyrillic — transliterate/keep surnames per established forms |
| `tr` | Academic Turkish | Latin — verbatim |
| `he` | **RTL.** MSA-equivalent formal register; Hebrew script. Proper nouns stay Latin | Hebrew script; no stray Latin outside proper nouns |
| `bn` | Clear academic Bengali; established terms but avoid over-Sanskritization | Bengali script |
| `ja` | Academic Japanese | Japanese script; proper nouns Latin/katakana per convention |
| `ko` | Academic Korean | Hangul; proper nouns Latin per convention |
| `id` | Academic Bahasa Indonesia (note: NOT identical to `ms` — do not copy Malay) | Latin — verbatim |
| `vi` | Academic Vietnamese | Latin (diacritics) — verbatim |
| `th` | Academic Thai | Thai script |

**`he` is the only remaining RTL locale.** `RTL_LOCALES` already contains it;
middleware sets `dir="rtl"` automatically. No extra code. The layer-1 check has
RTL/script-purity heuristics — trust its warnings.

---

## 5. Invariants — never violate (these caused the past bugs)

- **Chart leaf name ≠ on-disk filename** for ~40 theories (`Buzsáki` →
  `Buzsaki.json`, `Brain Circuits` → `Brain-Circuits.json`, `A. Clark` →
  `A-Clark.json`). Always use the resolved filenames in `theory-chunks.json` /
  the workflow `ALL` list. Never derive a fetch path from a raw chart name — an
  unmatched static path returns `index.html` with a 200, not a 404.
- **Never edit English source** (`public/data/*.json`, `public/i18n/*/en.json`).
  Only add locale-suffixed files.
- **Preserve each file's exact shape** — keys, nesting, string-vs-array, empty
  `""`/`[]`, even where it deviates from MTTS v5.0 (~7.5% of files drift). Never
  "fix" a misspelled/misplaced key; translate values, keep structure.
- **Do NOT translate:** `id_and_class.associated_thinkers[]`,
  `id_and_class.classification_tags[]`, `sources_and_references[].title_with_names`,
  `.year`, and `related_theories[].name` (cross-reference IDs — verbatim
  English). DO translate `related_theories[].relationship` and the freeform
  stance/status prose fields.
- Preserve markup tokens (`$Phi$`, `&Phi;`, LaTeX), literal `\n`, citation
  artifacts verbatim.
- Agents must **not** edit `STATUS.json` or `glossary.json` (only the
  orchestrator does, as the last step).

---

## 6. Resume / recovery (survives session limits)

Writes are atomic, so an interrupted run never corrupts a file. To recover:

```bash
# which of the 210 are missing for a locale?
comm -23 <(ls public/data/en 2>/dev/null || ls public/data/*.json | xargs -n1 basename | sort) \
         <(ls public/data/{locale}/ | sort)
```

(Simpler in practice: `ls public/data/{locale}/*.json | wc -l` — if <210, diff
against the `ALL` list and re-run a workflow whose `ALL` is just the missing
files.) Re-running only the gap is safe; completed files are byte-stable.

The Malay run completed clean in one pass (no gap-fill needed) — the 12-agent
workflow is the reliable default. Prefer it over hand-spawning agents.

---

## 7. Quick reference — files

- `docs/i18n/TRANSLATION_GUIDE.md` — tone/fidelity/schema rules (agents read this)
- `docs/i18n/glossary.json` — per-locale term + field-label renderings
- `docs/i18n/progress/STATUS.json` — the resume checkpoint
- `docs/i18n/progress/theory-chunks.json` — fixed 18×12 chunk assignment (real filenames)
- `scripts/i18n-check.js` — layer-1 QA (`node scripts/i18n-check.js {locale} [--files a,b]`)
- `src/shared/site.ts` — `SUPPORTED_LOCALES` (all 24) + `AVAILABLE_LOCALES` (shipped gate)
- `index.html` — inline `AVAILABLE` array (second half of the gate)
- `middleware.ts` — `OG_LOCALE_MAP` (all 24) + `RTL_LOCALES` + hreflang (generic)
