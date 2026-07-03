// Layer-1 deterministic QA for translated i18n content. No LLM calls, no
// network - pure structural/heuristic checks run after every translation
// batch, before it's marked "done" in docs/i18n/progress/STATUS.json.
//
// Usage:
//   node scripts/i18n-check.js <locale>
//   node scripts/i18n-check.js <locale> --files Eliminative.json,Functionalism.json
//
// Checks UI/taxonomy/seo dictionaries (if present for the locale) and any
// public/data/{locale}/*.json theory files against their English source.
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')

const DO_NOT_TRANSLATE_PATHS = new Set([
  'id_and_class.associated_thinkers[]',
  'id_and_class.classification_tags[]',
  'relations_and_sources.sources_and_references[].title_with_names',
  'relations_and_sources.sources_and_references[].year',
])

// Rough per-locale expected Unicode block, used only to flag pages that look
// suspiciously like they weren't translated at all (predominantly Latin
// script where a non-Latin script is expected). This is NOT a rigorous
// Simplified-vs-Traditional Chinese check (that needs a proper conversion
// table) - zh-CN/zh-TW script purity is flagged for layer-3 native review.
const SCRIPT_EXPECTATIONS = {
  ar: /[؀-ۿ]/,
  he: /[֐-׿]/,
  hi: /[ऀ-ॿ]/,
  bn: /[ঀ-৿]/,
  'zh-CN': /[一-鿿]/,
  'zh-TW': /[一-鿿]/,
  ja: /[぀-ヿ一-鿿]/,
  ko: /[가-힯]/,
  th: /[฀-๿]/,
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

// Collapses concrete array indices ("foo[0].bar") to the generic notation
// used in DO_NOT_TRANSLATE_PATHS ("foo[].bar"), so the do-not-translate
// check matches regardless of which array element is being visited.
function normalizePath(path) {
  return path.replace(/\[\d+\]/g, '[]')
}

// Walks two same-shaped-ish JSON trees and reports key/type drift plus
// leaf string diffs, using bracket-array path notation like
// "relations_and_sources.sources_and_references[].year".
function walk(source, target, pathPrefix, ctx) {
  const sourceType = typeOf(source)
  const targetType = typeOf(target)

  if (sourceType !== targetType) {
    ctx.typeMismatches.push(`${pathPrefix}: expected ${sourceType}, got ${targetType}`)
    return
  }

  if (sourceType === 'object') {
    const sourceKeys = Object.keys(source)
    const targetKeys = Object.keys(target)
    for (const key of sourceKeys) {
      if (!(key in target)) ctx.missingKeys.push(pathPrefix ? `${pathPrefix}.${key}` : key)
    }
    for (const key of targetKeys) {
      if (!(key in source)) ctx.orphanedKeys.push(pathPrefix ? `${pathPrefix}.${key}` : key)
    }
    for (const key of sourceKeys) {
      if (key in target) {
        walk(source[key], target[key], pathPrefix ? `${pathPrefix}.${key}` : key, ctx)
      }
    }
    return
  }

  if (sourceType === 'array') {
    const len = Math.max(source.length, target.length)
    for (let i = 0; i < len; i++) {
      if (i >= target.length) { ctx.missingKeys.push(`${pathPrefix}[${i}]`); continue }
      if (i >= source.length) { ctx.orphanedKeys.push(`${pathPrefix}[${i}]`); continue }
      walk(source[i], target[i], `${pathPrefix}[${i}]`, ctx)
    }
    return
  }

  // Leaf value.
  const doNotTranslate = DO_NOT_TRANSLATE_PATHS.has(normalizePath(pathPrefix))
  if (doNotTranslate) {
    if (source !== target) {
      ctx.doNotTranslateViolations.push(`${pathPrefix}: expected unchanged "${source}", got "${target}"`)
    }
    return
  }

  if (sourceType === 'string' && source.trim() !== '' && source === target) {
    ctx.identicalToSource.push(`${pathPrefix}: "${String(source).slice(0, 60)}"`)
  }

  if (sourceType === 'string') {
    const sourceTags = source.match(/<[^>]+>/g) || []
    const targetTags = target.match(/<[^>]+>/g) || []
    if (sourceTags.join('|') !== targetTags.join('|')) {
      ctx.placeholderMismatches.push(`${pathPrefix}: HTML tags differ (source: ${JSON.stringify(sourceTags)}, target: ${JSON.stringify(targetTags)})`)
    }
    const sourcePlaceholders = (source.match(/\{\{[^}]+\}\}|%\{[^}]+\}|\{[a-zA-Z_]+\}/g) || []).sort()
    const targetPlaceholders = (target.match(/\{\{[^}]+\}\}|%\{[^}]+\}|\{[a-zA-Z_]+\}/g) || []).sort()
    if (sourcePlaceholders.join('|') !== targetPlaceholders.join('|')) {
      ctx.placeholderMismatches.push(`${pathPrefix}: placeholders differ (source: ${JSON.stringify(sourcePlaceholders)}, target: ${JSON.stringify(targetPlaceholders)})`)
    }
  }
}

function checkScriptPurity(target, locale, ctx) {
  const expected = SCRIPT_EXPECTATIONS[locale]
  if (!expected) return
  const text = JSON.stringify(target)
  if (text.length > 20 && !expected.test(text)) {
    ctx.scriptPurityWarnings.push(`file appears to contain no ${locale} script characters at all - likely untranslated`)
  }
}

function newCtx() {
  return {
    missingKeys: [],
    orphanedKeys: [],
    typeMismatches: [],
    doNotTranslateViolations: [],
    identicalToSource: [],
    placeholderMismatches: [],
    scriptPurityWarnings: [],
  }
}

function report(label, ctx) {
  const hardFailures = ctx.missingKeys.length + ctx.orphanedKeys.length + ctx.typeMismatches.length + ctx.doNotTranslateViolations.length + ctx.placeholderMismatches.length
  const warnings = ctx.identicalToSource.length + ctx.scriptPurityWarnings.length

  if (hardFailures === 0 && warnings === 0) {
    console.log(`  OK  ${label}`)
    return { hardFailures: 0, warnings: 0 }
  }

  console.log(`${hardFailures > 0 ? 'FAIL' : 'WARN'}  ${label}`)
  for (const m of ctx.missingKeys) console.log(`        missing key: ${m}`)
  for (const m of ctx.orphanedKeys) console.log(`        orphaned key: ${m}`)
  for (const m of ctx.typeMismatches) console.log(`        type mismatch: ${m}`)
  for (const m of ctx.doNotTranslateViolations) console.log(`        do-not-translate violation: ${m}`)
  for (const m of ctx.placeholderMismatches) console.log(`        placeholder/tag mismatch: ${m}`)
  for (const m of ctx.identicalToSource) console.log(`        [warn] identical to English source: ${m}`)
  for (const m of ctx.scriptPurityWarnings) console.log(`        [warn] script purity: ${m}`)

  return { hardFailures, warnings }
}

function checkDictionary(kind, locale) {
  const sourcePath = join(ROOT, 'public', 'i18n', kind, 'en.json')
  const targetPath = join(ROOT, 'public', 'i18n', kind, `${locale}.json`)
  if (!existsSync(targetPath)) return null

  const source = loadJson(sourcePath)
  const target = loadJson(targetPath)
  const ctx = newCtx()
  walk(source, target, '', ctx)
  checkScriptPurity(target, locale, ctx)
  return report(`i18n/${kind}/${locale}.json`, ctx)
}

function checkTheoryFile(locale, filename) {
  const sourcePath = join(ROOT, 'public', 'data', filename)
  const targetPath = join(ROOT, 'public', 'data', locale, filename)
  if (!existsSync(sourcePath)) {
    console.log(`FAIL  data/${locale}/${filename}: no matching English source file public/data/${filename}`)
    return { hardFailures: 1, warnings: 0 }
  }
  if (!existsSync(targetPath)) return null

  const source = loadJson(sourcePath)
  const target = loadJson(targetPath)
  const ctx = newCtx()
  walk(source, target, '', ctx)
  checkScriptPurity(target, locale, ctx)
  return report(`data/${locale}/${filename}`, ctx)
}

function main() {
  const [locale, ...rest] = process.argv.slice(2)
  if (!locale) {
    console.error('Usage: node scripts/i18n-check.js <locale> [--files a.json,b.json]')
    process.exit(1)
  }

  const filesArgIndex = rest.indexOf('--files')
  const explicitFiles = filesArgIndex !== -1 ? rest[filesArgIndex + 1].split(',') : null

  let totalHardFailures = 0
  let totalWarnings = 0

  console.log(`\n=== i18n check: ${locale} ===\n`)

  for (const kind of ['ui', 'taxonomy', 'seo']) {
    const result = checkDictionary(kind, locale)
    if (result) {
      totalHardFailures += result.hardFailures
      totalWarnings += result.warnings
    }
  }

  const localeDataDir = join(ROOT, 'public', 'data', locale)
  const files = explicitFiles || (existsSync(localeDataDir) ? readdirSync(localeDataDir).filter(f => f.endsWith('.json')) : [])

  for (const filename of files) {
    const result = checkTheoryFile(locale, filename)
    if (result) {
      totalHardFailures += result.hardFailures
      totalWarnings += result.warnings
    }
  }

  console.log(`\n${totalHardFailures} hard failure(s), ${totalWarnings} warning(s) across ${files.length} theory file(s) + dictionaries.\n`)
  process.exit(totalHardFailures > 0 ? 1 : 0)
}

main()
