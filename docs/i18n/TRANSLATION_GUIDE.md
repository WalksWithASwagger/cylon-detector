# Consciousness Atlas — Translation Guide

This guide governs every translation of Consciousness Atlas content — UI strings (`public/i18n/ui/*.json`, `public/i18n/taxonomy/*.json`, `public/i18n/seo/*.json`) and theory content (`public/data/{locale}/*.json`) — into the 24 supported locales. Read this in full before translating anything, and pass it in full to every translation agent call. See `glossary.json` in this directory for the term-by-term reference this guide points to.

## Tone and fidelity

- Academic, precise, calm, intellectually serious. Translate meaning, not word-for-word.
- No casual, marketing, mystical, or poetic phrasing unless the English source is itself poetic (it generally isn't). Avoid hype words ("discover", "unlock", "revolutionary") unless present in the source.
- Prefer the term used in academic philosophy / philosophy of mind / cognitive science over an everyday-speech alternative when a word has both.
- Do not add interpretation, explanation, or framing beyond what the source says. Preserve intentional ambiguity — don't resolve it for the reader.
- Do not soften or strengthen a stated position. Do not collapse two distinct technical terms into one generic word (e.g. don't blur "physicalism" into "materialism" unless the English source already does).
- Do not mistranslate "idealism" as optimism/positivity, or "subject" as the grammatical subject of a sentence (unless the context is genuinely linguistic).
- "Representation", "intentionality", and "phenomenal" are technical terms in this content — treat them as such, not everyday words.

## Proper names and citations

- Philosopher and school-of-thought names use the standard localized form already established in that language's academic literature (e.g. René Descartes, Immanuel Kant) — never invent a new transliteration or translation for a name or tradition.
- Bibliographic/citation text — `sources_and_references[].title_with_names`, `sources_and_references[].year`, and any citation-style text embedded in UI copy (e.g. the Kuhn paper citation on the homepage) — is copied verbatim, not translated. Same rule for `associated_thinkers`.
- `classification_tags` in theory JSON files are left untranslated (verbatim from English). They read as internal taxonomy keys more than prose, and translating them risks 24 independently-drifting tag vocabularies with nothing to keep them aligned. Do not translate them even though they are technically free strings.

## Placeholders and markup — never touched

- Any literal HTML tag embedded in a string (e.g. `<a href="...">...</a>` in the homepage About-page copy) must survive translation exactly — same tag, same attributes, only the visible text inside changes.
- Any interpolation syntax (`{{term}}`, `%{name}`, `{count}`) must survive unchanged, character for character.
- JSON keys are never translated, only values.

## Schema preservation — the single most important rule

When translating a theory content file (`public/data/{locale}/{TheoryName}.json`), the output must have **exactly** the same keys, the same nesting, and the same value types (string vs. array) as the English source file — even where that source file deviates from the documented MTTS v5.0 schema (`src/data/THEORY.md`). About 7.5% of the 211 source files have a missing, renamed, or misplaced field, or a string-vs-array mismatch on a field that's usually the other type. **Do not "fix" this.** Translate the values that are there, in the shape they're in. Adding, removing, or renaming a key, or changing a field's JSON type, is treated as a translation error even if the result looks more correct.

- If a field is empty (`""` or `[]`) in the source, it stays empty in the translation. Don't fill it in.
- `associated_thinkers`, `sources_and_references[].title_with_names`, `sources_and_references[].year` are copied byte-for-byte from the source — see "Proper names and citations" above.
- Fields like `implications.*.stance`, `ontological_status`, `primitive_or_emergent_status`, `emergence_type`, and `related_theories[].relationship` look like short controlled-vocabulary enums but are **not** enforced as one — real values include things like `"Yes (Blurred/Non-Personal)"` or `"Compatible (regarding rejection of the self)"`. Translate them as the short freeform prose they actually are; do not normalize them to a fixed small vocabulary.

## Key hygiene

- When a UI dictionary key is added, renamed, or removed in the English source, every other locale file must be updated to match in the same change — no missing keys, no orphaned keys left behind.
- Run the layer-1 validation script (see `docs/i18n/progress/`) after every batch, before marking it done.
- Watch for accidental cross-locale contamination — a locale file must never contain another locale's strings.

## Locale-specific notes

Add to this list as edge cases are discovered for a given language — treat it as a living log, not a one-time write.

- **German (`de`)** — formal academic register. Prefer established terms: Bewusstsein (consciousness), Geist (mind), Subjektivität (subjectivity), Phänomenologie (phenomenology), Erkenntnistheorie (epistemology), Metaphysik (metaphysics), Idealismus (idealism), Materialismus (materialism), Physikalismus (physicalism). Avoid colloquial phrasing.
- **Spanish (`es`)** — neutral Castilian Spanish suitable for academic philosophy, not a regional variant. conciencia, mente, subjetividad, fenomenología, epistemología, metafísica, idealismo, materialismo, fisicalismo.
- **French (`fr`)** — formal academic French. conscience, esprit, subjectivité, phénoménologie, épistémologie, métaphysique, idéalisme, matérialisme, physicalisme.
- **Portuguese, Brazil (`pt-BR`)** — Brazilian academic terminology; avoid Portugal-specific phrasing.
- **Portuguese, Portugal (`pt-PT`)** — European Portuguese academic terminology; avoid Brazilian colloquialisms. `pt-BR` and `pt-PT` should not end up identical except where a phrase is genuinely identical in both varieties — treat convergence as a signal to double check, not a shortcut.
- **Simplified Chinese (`zh-CN`)** — Simplified script only, no Traditional characters.
- **Traditional Chinese (`zh-TW`)** — Traditional script only, no Simplified characters. Do not mix scripts within a file in either direction.
- **Arabic (`ar`)** — Modern Standard Arabic only, no dialect. Formal, precise philosophical register.
- **Hebrew (`he`)** — same register expectations as Arabic; RTL.
- **Hindi (`hi`) and Bengali (`bn`)** — clear academic language; prefer established philosophical terminology where it exists, but avoid excessive Sanskritization if it would harm readability for an educated general reader.

## Do-not-translate checklist (quick reference)

- `associated_thinkers`
- `sources_and_references[].title_with_names`
- `sources_and_references[].year`
- `classification_tags`
- Citation-style text embedded in UI copy (e.g. the homepage's Kuhn paper citation)
- Brand/product names ("Consciousness Atlas", "GitHub", "X")

## QA checklist before marking a batch done

- JSON parses without error.
- Key set and value types match the English source exactly (no added/removed/renamed keys, no string↔array changes).
- No missing or orphaned keys relative to the English UI dictionaries.
- Placeholders, interpolation syntax, and embedded HTML tags are unchanged.
- No leftover English text outside the do-not-translate list.
- Glossary terminology (see `glossary.json`) is applied consistently throughout the batch.
- Academic tone is preserved — no marketing/mystical drift.
- `zh-CN` is Simplified-only; `zh-TW` is Traditional-only.
- `pt-BR` and `pt-PT` are meaningfully distinct except where naturally identical.
- `ar` is Modern Standard Arabic, not a dialect.
