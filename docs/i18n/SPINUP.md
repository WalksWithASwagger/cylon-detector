# i18n — Next-Locale Spin-Up Runbook

One doc with everything needed to translate the remaining languages. The
software/architecture phase (Part A of the plan) is **done and shipped**;
what's left is pure content production, one locale at a time. Adding a locale
is a content-only change — no code edits except the two-line shipped-locale
gate (step 5 below).

---

## 1. Current state (as of 2026-09-21)

**Shipped (18):** `en` (source) · `es` `fr` `de` `it` `nl` `pt-PT` `ru` `uk` `tr` `ar` `he` `hi` `zh-CN` `zh-TW` `ja` `id` `ms`

These match `AVAILABLE_LOCALES` in `src/shared/site.ts` and are `done` /
`qa_layer1: passed` in `docs/i18n/progress/STATUS.json`.

**Remaining (`not_started`, 6):** `pl` `pt-BR` `bn` `ko` `vi` `th`

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
`ar` and `he`.

---

## 2. The proven pipeline (what worked for the shipped locales)

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

### Step B — 210 theory content files

The reusable file split lives in this repository at
`docs/i18n/progress/theory-chunks.json` (18 chunks × up to 12 real on-disk
filenames). Use those filenames, not chart leaf names (see §6). The `ALL`
filename list (210 real on-disk filenames) is the union of those chunks and is
**identical for every locale** — do not regenerate it.

There is no in-repo reusable Claude Workflow template. Do not look for
`~/.claude/projects/.../translate-ms-theories-wf_*.js` — that path is
machine-local and is not part of this tree. The Hebrew/Indonesian one-shot
helpers (`scripts/i18n-wf-he.js`, `scripts/i18n-wf-id.js`) were deleted in
#47 after those locales shipped; they are not in this tree and are not
the runbook.

For each remaining locale, translate the 18 chunks in `STATUS.json` order:
1. Read `docs/i18n/TRANSLATION_GUIDE.md` and `docs/i18n/glossary.json`.
2. For each filename in the next `not_started` chunk, write
   `public/data/{locale}/{filename}` from the English source at
   `public/data/{filename}`. Apply the §4 register note for the locale.
3. Validate the batch:
   `node scripts/i18n-check.js {locale} --files <comma-list>` → 0 hard
   failures.
4. Only the orchestrator marks that chunk `done` in `STATUS.json` after
   validation.

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

**No remaining RTL locales.** `ar` and `he` are both shipped. `RTL_LOCALES`
already contains both; middleware sets `dir="rtl"` automatically. No extra
code. The layer-1 check has RTL/script-purity heuristics — trust its warnings.

---

## 5. Invariants — never violate (these caused the past bugs)

- **Chart leaf name ≠ on-disk filename** for ~40 theories (`Buzsáki` →
  `Buzsaki.json`, `Brain Circuits` → `Brain-Circuits.json`, `A. Clark` →
  `A-Clark.json`). Always use the resolved filenames in `theory-chunks.json`.
  Never derive a fetch path from a raw chart name — an unmatched static path
  returns `index.html` with a 200, not a 404.
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
against the filenames in `theory-chunks.json` and translate only the missing
ones.) Re-running only the gap is safe; completed files are byte-stable.

The Malay run completed clean in one pass (no gap-fill needed). Re-run only
the missing filenames from `theory-chunks.json`; prefer chunked batches over
hand-spawning one file at a time.

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
