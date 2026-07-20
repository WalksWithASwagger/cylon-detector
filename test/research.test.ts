import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { normalizeEvaluationRun } from '@/bench/v2/artifact'
import {
  assertLocalProxyConfiguration,
  buildOsfReadyPackage,
  buildRoCrate,
  compareRunVersions,
  createPreregistration,
  createTheoryBundle,
  describeReplayDrift,
  normalizeMetadataIntake,
  requestLocalOpenAiCompatibleAnalysis,
  researchRunContextSchema
} from '@/bench/research'
import { defaultBenchmarkV2 } from '@/bench/v2/defaultRegistry'

const fixturePath = new URL('../fixtures/demo/witness-theory-adjudicated.json', import.meta.url)

describe('research-grade portable machinery', () => {
  it('freezes a preregistration and distinguishes optimization from sealed replication', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const prereg = await createPreregistration({
      registrationId: '00000000-0000-4000-8000-000000000020',
      createdAt: '2026-07-20T20:00:00.000Z',
      benchmark: run.benchmark.definition,
      predictions: ['Disrupting the proposed mechanism changes the witness.'],
      exclusions: ['Unreadable source pages.'],
      interpretationRules: ['Rejection remains a result.'],
      plannedAnalyses: ['Categorical claim-level comparison.']
    })

    expect(prereg.integrityDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(researchRunContextSchema.safeParse({ runClass: 'optimization', deviations: [] }).success).toBe(true)
    expect(researchRunContextSchema.safeParse({ runClass: 'sealed_replication', deviations: [] }).success).toBe(false)
    expect(researchRunContextSchema.safeParse({
      runClass: 'sealed_replication',
      preregistrationDigest: prereg.integrityDigest,
      deviations: [{ recordedAt: '2026-07-20T20:05:00.000Z', description: 'One unreadable page.', impact: 'Claim excluded.' }]
    }).success).toBe(true)
  })

  it('packages reports for OSF and emits PROV and CRediT relationships without writing externally', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const prereg = await createPreregistration({
      registrationId: '00000000-0000-4000-8000-000000000021',
      createdAt: '2026-07-20T20:00:00.000Z',
      benchmark: run.benchmark.definition,
      predictions: ['Prediction A'], exclusions: ['Exclusion A'],
      interpretationRules: ['Rule A'], plannedAnalyses: ['Analysis A']
    })
    const crate = await buildRoCrate(run, [{ name: 'Kris Krüg', creditRole: 'Conceptualization' }])
    const osf = await buildOsfReadyPackage(run, prereg, crate)

    expect(crate['@context']).toContain('https://w3id.org/ro/crate/1.1/context')
    expect(JSON.stringify(crate)).toContain('prov:wasGeneratedBy')
    expect(JSON.stringify(crate)).toContain('Conceptualization')
    expect(osf.schemaVersion).toBe('osf-ready-package/v1')
    expect(osf.files.some(file => file.name.endsWith('_methods-evidence.html'))).toBe(true)
    expect(osf).not.toHaveProperty('remoteWrite')
  })

  it('retains per-paper source identity and compares versions without a winner', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const bundle = await createTheoryBundle('Witness family', [run, { ...run, runId: '00000000-0000-4000-8000-000000000022' }])
    const comparison = compareRunVersions(run, run)
    const drift = describeReplayDrift(run, { ...run, appVersion: '0.2.0' })

    expect(new Set(bundle.sources.map(source => source.sourceId)).size).toBe(2)
    expect(bundle.claims.every(claim => bundle.sources.some(source => source.sourceId === claim.sourceId))).toBe(true)
    expect(comparison).not.toHaveProperty('winner')
    expect(comparison).not.toHaveProperty('score')
    expect(drift.software.changed).toBe(true)
  })

  it('accepts metadata only and keeps local-model adapters loopback and human-launched', () => {
    expect(normalizeMetadataIntake({
      kind: 'crossref',
      doi: '10.0000/example',
      title: 'Example paper',
      authors: ['A. Author'],
      year: 2026,
      fullText: 'must never enter metadata intake'
    })).not.toHaveProperty('fullText')
    expect(() => assertLocalProxyConfiguration({
      schemaVersion: 'openai-compatible-local-adapter/v1',
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      model: 'local-model',
      launchedByHuman: true
    })).toThrow(/loopback/i)
    expect(() => assertLocalProxyConfiguration({
      schemaVersion: 'openai-compatible-local-adapter/v1',
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local-model',
      launchedByHuman: true
    })).not.toThrow()
  })

  it('uses the local adapter only through an explicitly enabled loopback proxy', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const text = 'A locally processed consciousness claim with enough source text for analysis.'
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      id: 'local-response-1',
      choices: [{ message: { content: JSON.stringify(run.aiDraft) } }],
      usage: { prompt_tokens: 10, completion_tokens: 20 }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const result = await requestLocalOpenAiCompatibleAnalysis({
      schemaVersion: 'openai-compatible-local-adapter/v1',
      enabled: true,
      baseUrl: 'http://127.0.0.1:11434/v1',
      model: 'local-model',
      launchedByHuman: true
    }, {
      schemaVersion: 'mac-analysis-request/v2',
      benchmark: {
        id: defaultBenchmarkV2.id,
        version: defaultBenchmarkV2.version,
        integrityDigest: defaultBenchmarkV2.integrityDigest
      },
      paper: {
        fileName: 'local.pdf', sha256: 'a'.repeat(64), textSha256: 'b'.repeat(64),
        byteSize: 100, pageCount: 1, characterCount: text.length,
        pages: [{ pdfPage: 1, text }]
      }
    }, fetcher as typeof fetch)

    expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:11434/v1/chat/completions', expect.any(Object))
    expect(result.analysis.provider).toBe('local-openai-compatible')
    expect(result.analysis.store).toBe(false)
  })
})
