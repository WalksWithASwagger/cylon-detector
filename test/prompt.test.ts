import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { analysisRequestSchema, type AnalysisRequest } from '@/bench/schema'
import { buildPaperPrompt, buildSystemPrompt, PROMPT_VERSION } from '@/server/prompt'

type PromptInvariant = {
  id: string
  kind: 'safety' | 'epistemic' | 'provenance'
  phrase: string
}

type PromptBoundaryCase = {
  id: string
  scenario: string
  exercises: string[]
  paper: {
    fileName: string
    title: string
    authors: string[]
    year: number
    doi: string
    sha256: string
    textSha256: string
    byteSize: number
  }
  pages: Array<{ pdfPage: number; text: string }>
  probes: string[]
  expectedPageMarkers: number[]
}

type PromptBoundaryCorpus = {
  schemaVersion: string
  promptVersion: string
  networkAccess: string
  researchBoundary: string
  requiredScenarios: string[]
  boundary: {
    paperWrapper: string
    pageWrapper: string
    pageAttribute: string
  }
  invariants: PromptInvariant[]
  cases: PromptBoundaryCase[]
}

const corpus = JSON.parse(
  readFileSync(new URL('../fixtures/evals/prompt-boundaries.json', import.meta.url), 'utf8')
) as PromptBoundaryCorpus

const requiredInvariantIds = [
  'role-boundary',
  'supplied-text-only',
  'untrusted-source',
  'cite-supplied-pages',
  'insufficient-evidence',
  'model-proposed-extensions',
  'no-consciousness-score',
  'human-adjudication'
] as const

function toAnalysisRequest(item: PromptBoundaryCase): AnalysisRequest {
  const characterCount = item.pages.reduce((total, page) => total + page.text.length, 0)
  return analysisRequestSchema.parse({
    benchmarkVersion: '0.1.0-alpha.1',
    paper: {
      fileName: item.paper.fileName,
      title: item.paper.title,
      authors: item.paper.authors,
      year: item.paper.year,
      doi: item.paper.doi,
      sha256: item.paper.sha256,
      textSha256: item.paper.textSha256,
      byteSize: item.paper.byteSize,
      pageCount: item.pages.length,
      characterCount,
      pages: item.pages
    }
  })
}

function assertSystemPromptInvariants(prompt: string, invariants: PromptInvariant[]): void {
  for (const invariant of invariants) {
    if (!prompt.includes(invariant.phrase)) {
      throw new Error(`Missing required prompt invariant: ${invariant.id}`)
    }
  }
}

function untrustedInterior(paperPrompt: string, wrapper: string): string {
  const open = `<${wrapper}>`
  const close = `</${wrapper}>`
  const start = paperPrompt.indexOf(open)
  const end = paperPrompt.lastIndexOf(close)
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Missing required untrusted boundary: ${wrapper}`)
  }
  return paperPrompt.slice(start + open.length, end)
}

describe('offline prompt-boundary corpus', () => {
  it('is a versioned synthetic corpus covering every required scenario', () => {
    expect(corpus.schemaVersion).toBe('mac-prompt-boundary-corpus/v1')
    expect(corpus.promptVersion).toBe(PROMPT_VERSION)
    expect(corpus.networkAccess).toBe('disabled')
    expect(corpus.researchBoundary).toBe('synthetic-fixture-not-human-subject-research')
    expect(new Set(corpus.cases.map(item => item.scenario))).toEqual(new Set(corpus.requiredScenarios))
    expect(corpus.requiredScenarios).toEqual([
      'instruction-injection',
      'missing-evidence',
      'model-proposed-predictions',
      'exact-page-markers',
      'score-request',
      'human-adjudication-bypass'
    ])
    expect(corpus.invariants.map(invariant => invariant.id)).toEqual([...requiredInvariantIds])
  })

  it('contains only synthetic fixture text', () => {
    const serialized = JSON.stringify(corpus)
    expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]|OPENAI_API_KEY|api[_-]?key/i)
    expect(serialized).not.toMatch(/@[\w.-]+\.(com|edu|org)/i)
    expect(serialized).not.toMatch(/orcid|participant|password|secret/i)
    expect(serialized).not.toMatch(/Integrated Information Theory|Tononi|Koch/i)
    expect(corpus.cases.every(item => item.paper.authors.every(author => author.includes('Synthetic')))).toBe(true)
    expect(corpus.cases.every(item => item.paper.doi.startsWith('10.0000/synthetic-'))).toBe(true)
  })

  it('retains every safety and epistemic invariant without snapshotting the benchmark dump', () => {
    const systemPrompt = buildSystemPrompt()
    assertSystemPromptInvariants(systemPrompt, corpus.invariants)
    expect(systemPrompt).toContain('Benchmark definition:')
    expect(JSON.stringify(corpus)).not.toContain(systemPrompt)
    expect(corpus).not.toHaveProperty('systemPromptSnapshot')
  })

  it('fails in a focused way when a required invariant is removed', () => {
    const systemPrompt = buildSystemPrompt()
    expect(() => assertSystemPromptInvariants(systemPrompt, corpus.invariants)).not.toThrow()

    for (const invariant of corpus.invariants) {
      const mutated = systemPrompt.replace(invariant.phrase, '')
      expect(mutated).not.toBe(systemPrompt)
      expect(() => assertSystemPromptInvariants(mutated, corpus.invariants)).toThrow(
        `Missing required prompt invariant: ${invariant.id}`
      )
    }
  })

  it('builds the same system prompt for every corpus paper', () => {
    const baseline = buildSystemPrompt()
    for (const item of corpus.cases) {
      const request = toAnalysisRequest(item)
      expect(buildSystemPrompt()).toBe(baseline)
      expect(buildPaperPrompt(request)).not.toBe(baseline)
    }
  })

  it.each(corpus.cases)('keeps $id probes inside the untrusted paper boundary', item => {
    const request = toAnalysisRequest(item)
    const systemPrompt = buildSystemPrompt()
    const paperPrompt = buildPaperPrompt(request)
    const interior = untrustedInterior(paperPrompt, corpus.boundary.paperWrapper)

    expect(systemPrompt).not.toContain(paperPrompt)
    expect(paperPrompt.startsWith(`File: ${item.paper.fileName}`)).toBe(true)
    expect(paperPrompt).toContain(`Title: ${item.paper.title}`)
    expect(paperPrompt).toContain(`Authors: ${item.paper.authors.join(', ')}`)
    expect(paperPrompt).toContain(`Year: ${item.paper.year}`)
    expect(paperPrompt).toContain(`DOI: ${item.paper.doi}`)
    expect(paperPrompt.slice(paperPrompt.lastIndexOf(`</${corpus.boundary.paperWrapper}>`))).toBe(
      `</${corpus.boundary.paperWrapper}>`
    )

    for (const page of item.pages) {
      expect(interior).toContain(
        `<${corpus.boundary.pageWrapper} ${corpus.boundary.pageAttribute}="${page.pdfPage}">\n${page.text}\n</${corpus.boundary.pageWrapper}>`
      )
    }

    expect(item.expectedPageMarkers).toEqual(item.pages.map(page => page.pdfPage))
    for (const pdfPage of item.expectedPageMarkers) {
      expect(interior).toContain(
        `<${corpus.boundary.pageWrapper} ${corpus.boundary.pageAttribute}="${pdfPage}">`
      )
    }

    for (const probe of item.probes) {
      expect(systemPrompt).not.toContain(probe)
      expect(interior).toContain(probe)
      expect(paperPrompt.indexOf(probe)).toBeGreaterThan(paperPrompt.indexOf(`<${corpus.boundary.paperWrapper}>`))
    }

    for (const invariantId of item.exercises) {
      const invariant = corpus.invariants.find(candidate => candidate.id === invariantId)
      expect(invariant, `unknown invariant ${invariantId}`).toBeTruthy()
      expect(systemPrompt).toContain(invariant!.phrase)
    }
  })
})
