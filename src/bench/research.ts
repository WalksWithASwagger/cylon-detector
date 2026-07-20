import { z } from 'zod'
import { stableStringify } from './artifact'
import { sha256Text } from './hash'
import { generateReportBundle } from './v2/reports'
import {
  benchmarkDefinitionV2Schema,
  integrityDigestSchema,
  type BenchmarkDefinitionV2
} from './v2/contracts'
import type { EvaluationRunV2 } from './v2/artifact'
import { analysisResponseSchema, type AnalysisResponse } from './analysis'
import { aiDraftSchema } from './schema'
import { toLegacyAnalysisRequest, type AnalysisRequestV2 } from './v2/contracts'
import { buildPaperPrompt, buildSystemPrompt, PROMPT_VERSION } from '../server/prompt'

export const preregistrationSchema = z.object({
  schemaVersion: z.literal('mac-preregistration/v1'),
  registrationId: z.string().uuid(),
  createdAt: z.string().datetime(),
  frozenBenchmark: z.object({
    id: z.string().min(1),
    version: z.string().min(1),
    integrityDigest: integrityDigestSchema,
    challenges: z.array(z.object({ id: z.string().min(1), version: z.string().min(1), integrityDigest: integrityDigestSchema })).min(1)
  }),
  predictions: z.array(z.string().min(1)).min(1),
  exclusions: z.array(z.string().min(1)).min(1),
  interpretationRules: z.array(z.string().min(1)).min(1),
  plannedAnalyses: z.array(z.string().min(1)).min(1),
  optimizationPolicy: z.literal('Optimization runs are exploratory and cannot be relabelled as sealed replications.'),
  integrityDigest: integrityDigestSchema
})

export const researchRunContextSchema = z.object({
  runClass: z.enum(['optimization', 'sealed_replication']),
  preregistrationDigest: integrityDigestSchema.optional(),
  deviations: z.array(z.object({
    recordedAt: z.string().datetime(),
    description: z.string().min(1),
    impact: z.string().min(1)
  }))
}).superRefine((context, refinement) => {
  if (context.runClass === 'sealed_replication' && !context.preregistrationDigest) {
    refinement.addIssue({ code: 'custom', message: 'Sealed replication requires a preregistration digest' })
  }
})

export type Preregistration = z.infer<typeof preregistrationSchema>

interface PreregistrationInput {
  registrationId: string
  createdAt?: string
  benchmark: BenchmarkDefinitionV2
  predictions: string[]
  exclusions: string[]
  interpretationRules: string[]
  plannedAnalyses: string[]
}

export async function createPreregistration(input: PreregistrationInput): Promise<Preregistration> {
  const benchmark = benchmarkDefinitionV2Schema.parse(input.benchmark)
  const unsigned = {
    schemaVersion: 'mac-preregistration/v1' as const,
    registrationId: input.registrationId,
    createdAt: input.createdAt ?? new Date().toISOString(),
    frozenBenchmark: {
      id: benchmark.id,
      version: benchmark.version,
      integrityDigest: benchmark.integrityDigest,
      challenges: benchmark.challenges
    },
    predictions: input.predictions,
    exclusions: input.exclusions,
    interpretationRules: input.interpretationRules,
    plannedAnalyses: input.plannedAnalyses,
    optimizationPolicy: 'Optimization runs are exploratory and cannot be relabelled as sealed replications.' as const
  }
  return preregistrationSchema.parse({
    ...unsigned,
    integrityDigest: await sha256Text(stableStringify(unsigned))
  })
}

export const theoryBundleSchema = z.object({
  schemaVersion: z.literal('theory-bundle/v1'),
  bundleId: z.string().uuid(),
  theoryLabel: z.string().min(1),
  createdAt: z.string().datetime(),
  sources: z.array(z.object({
    sourceId: z.string().min(1),
    runId: z.string().uuid(),
    receiptDigest: integrityDigestSchema,
    paper: z.object({
      fileName: z.string().min(1),
      sha256: integrityDigestSchema,
      textSha256: integrityDigestSchema,
      title: z.string().optional(),
      doi: z.string().optional()
    })
  })).min(1),
  claims: z.array(z.object({
    bundleClaimId: z.string().min(1),
    sourceId: z.string().min(1),
    originalClaimId: z.string().min(1),
    challengeId: z.string().min(1),
    demand: z.string().min(1),
    value: z.string()
  })),
  integrityDigest: integrityDigestSchema
})

export async function createTheoryBundle(
  theoryLabel: string,
  runs: EvaluationRunV2[],
  bundleId = crypto.randomUUID(),
  createdAt = new Date().toISOString()
) {
  const sources = runs.map((run, index) => ({
    sourceId: `source:${index + 1}:${run.paper.sha256.slice(0, 16)}`,
    runId: run.runId,
    receiptDigest: run.integrityDigest,
    paper: {
      fileName: run.paper.fileName,
      sha256: run.paper.sha256,
      textSha256: run.paper.textSha256,
      ...(run.paper.title ? { title: run.paper.title } : {}),
      ...(run.paper.doi ? { doi: run.paper.doi } : {})
    }
  }))
  const claims = runs.flatMap((run, sourceIndex) => run.claimLedger.map((row, claimIndex) => ({
    bundleClaimId: `bundle-claim:${sourceIndex + 1}:${claimIndex + 1}`,
    sourceId: sources[sourceIndex].sourceId,
    originalClaimId: row.claimId,
    challengeId: row.challenge.id,
    demand: row.demand,
    value: row.finalCall?.value ?? row.modelDraft
  })))
  const unsigned = { schemaVersion: 'theory-bundle/v1' as const, bundleId, theoryLabel, createdAt, sources, claims }
  return theoryBundleSchema.parse({ ...unsigned, integrityDigest: await sha256Text(stableStringify(unsigned)) })
}

export function compareRunVersions(before: EvaluationRunV2, after: EvaluationRunV2) {
  const prior = new Map(before.stressFractureMap.map(fracture => [fracture.challengeId, fracture]))
  return {
    schemaVersion: 'categorical-run-comparison/v1' as const,
    before: { runId: before.runId, integrityDigest: before.integrityDigest },
    after: { runId: after.runId, integrityDigest: after.integrityDigest },
    comparisons: after.stressFractureMap.map(fracture => {
      const priorFracture = prior.get(fracture.challengeId)
      return {
        challengeId: fracture.challengeId,
        before: priorFracture?.humanVerdict ?? priorFracture?.modelVerdict ?? 'not_present',
        after: fracture.humanVerdict ?? fracture.modelVerdict,
        changed: (priorFracture?.humanVerdict ?? priorFracture?.modelVerdict) !== (fracture.humanVerdict ?? fracture.modelVerdict)
      }
    }),
    interpretation: 'Categorical differences only. No winner, ranking, or aggregate score is produced.' as const
  }
}

function driftField(before: string, after: string) {
  return { before, after, changed: before !== after }
}

export function describeReplayDrift(before: EvaluationRunV2, after: EvaluationRunV2) {
  return {
    schemaVersion: 'replay-drift-report/v1' as const,
    beforeReceipt: before.integrityDigest,
    afterReceipt: after.integrityDigest,
    model: driftField(`${before.analysis.provider}/${before.analysis.model}`, `${after.analysis.provider}/${after.analysis.model}`),
    prompt: driftField(before.analysis.promptDigest, after.analysis.promptDigest),
    benchmark: driftField(before.benchmark.definition.integrityDigest, after.benchmark.definition.integrityDigest),
    software: driftField(`${before.appVersion}/${before.sourceCommit}`, `${after.appVersion}/${after.sourceCommit}`),
    claims: after.claimLedger.map(row => {
      const prior = before.claimLedger.find(candidate => candidate.challenge.id === row.challenge.id && candidate.demand === row.demand)
      const beforeValue = prior?.finalCall?.value ?? prior?.modelDraft ?? 'not_present'
      const afterValue = row.finalCall?.value ?? row.modelDraft
      return { claimId: row.claimId, changed: beforeValue !== afterValue, before: beforeValue, after: afterValue }
    })
  }
}

export async function buildRoCrate(
  run: EvaluationRunV2,
  contributors: Array<{ name: string; creditRole: string }>
) {
  const actionId = `#evaluation-${run.runId}`
  const graph: Array<Record<string, unknown>> = [
    {
      '@id': 'ro-crate-metadata.json',
      '@type': 'CreativeWork',
      about: { '@id': './' },
      conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' }
    },
    {
      '@id': './',
      '@type': 'Dataset',
      name: `Cylon Detector receipt for ${run.aiDraft.theory.name}`,
      hasPart: [{ '@id': 'receipt.json' }, { '@id': 'paper-source' }],
      'prov:wasGeneratedBy': { '@id': actionId }
    },
    {
      '@id': 'receipt.json',
      '@type': 'CreativeWork',
      sha256: run.integrityDigest,
      'prov:wasDerivedFrom': { '@id': 'paper-source' }
    },
    {
      '@id': 'paper-source',
      '@type': 'CreativeWork',
      name: run.paper.title ?? run.paper.fileName,
      sha256: run.paper.sha256,
      identifier: run.paper.doi
    },
    {
      '@id': actionId,
      '@type': ['CreateAction', 'prov:Activity'],
      instrument: `${run.analysis.provider}/${run.analysis.model}`,
      object: { '@id': 'paper-source' },
      result: { '@id': 'receipt.json' }
    },
    ...contributors.map((contributor, index) => ({
      '@id': `#contributor-${index + 1}`,
      '@type': 'Person',
      name: contributor.name,
      'credit:role': contributor.creditRole
    }))
  ]
  const crate = {
    '@context': [
      'https://w3id.org/ro/crate/1.1/context',
      { prov: 'http://www.w3.org/ns/prov#', credit: 'https://credit.niso.org/' }
    ],
    '@graph': graph
  }
  return { ...crate, integrityDigest: await sha256Text(stableStringify(crate)) }
}

const osfFileSchema = z.object({
  name: z.string().min(1),
  mediaType: z.string().min(1),
  integrityDigest: integrityDigestSchema,
  content: z.string()
})

export const osfReadyPackageSchema = z.object({
  schemaVersion: z.literal('osf-ready-package/v1'),
  packageId: z.string().uuid(),
  createdAt: z.string().datetime(),
  uploadNotice: z.literal('Local export only. No external archive write has occurred.'),
  files: z.array(osfFileSchema).min(1),
  integrityDigest: integrityDigestSchema
})

export async function buildOsfReadyPackage(
  run: EvaluationRunV2,
  preregistration: Preregistration,
  roCrate: Record<string, unknown>,
  packageId = crypto.randomUUID(),
  createdAt = new Date().toISOString()
) {
  const reports = generateReportBundle(run)
  const sourceFiles = [
    ['receipt.json', 'application/json', `${JSON.stringify(run, null, 2)}\n`],
    ['preregistration.json', 'application/json', `${JSON.stringify(preregistration, null, 2)}\n`],
    ['ro-crate-metadata.json', 'application/ld+json', `${JSON.stringify(roCrate, null, 2)}\n`],
    [`${run.runId}_lab-note.html`, 'text/html', reports.labNoteHtml],
    [`${run.runId}_methods-evidence.html`, 'text/html', reports.methodsHtml],
    [`${run.runId}_claim-ledger.csv`, 'text/csv', reports.claimLedgerCsv],
    [`${run.runId}_claim-ledger.json`, 'application/json', reports.claimLedgerJson]
  ] as const
  const files = await Promise.all(sourceFiles.map(async ([name, mediaType, content]) => osfFileSchema.parse({
    name,
    mediaType,
    content,
    integrityDigest: await sha256Text(content)
  })))
  const unsigned = {
    schemaVersion: 'osf-ready-package/v1' as const,
    packageId,
    createdAt,
    uploadNotice: 'Local export only. No external archive write has occurred.' as const,
    files
  }
  return osfReadyPackageSchema.parse({ ...unsigned, integrityDigest: await sha256Text(stableStringify(unsigned)) })
}

export const metadataIntakeSchema = z.object({
  kind: z.enum(['doi', 'crossref', 'zotero']),
  doi: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  authors: z.array(z.string().min(1)).optional(),
  year: z.number().int().min(1600).max(2200).optional(),
  sourceUrl: z.string().url().optional(),
  zoteroKey: z.string().min(1).optional()
})

export function normalizeMetadataIntake(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Metadata input must be an object')
  const candidate = input as Record<string, unknown>
  return metadataIntakeSchema.parse({
    kind: candidate.kind,
    ...(typeof candidate.doi === 'string' ? { doi: candidate.doi } : {}),
    ...(typeof candidate.title === 'string' ? { title: candidate.title } : {}),
    ...(Array.isArray(candidate.authors) ? { authors: candidate.authors } : {}),
    ...(typeof candidate.year === 'number' ? { year: candidate.year } : {}),
    ...(typeof candidate.sourceUrl === 'string' ? { sourceUrl: candidate.sourceUrl } : {}),
    ...(typeof candidate.zoteroKey === 'string' ? { zoteroKey: candidate.zoteroKey } : {})
  })
}

export const localModelAdapterSchema = z.object({
  schemaVersion: z.literal('openai-compatible-local-adapter/v1'),
  enabled: z.boolean(),
  baseUrl: z.string().url(),
  model: z.string().min(1),
  launchedByHuman: z.boolean()
})

export function assertLocalProxyConfiguration(input: unknown) {
  const configuration = localModelAdapterSchema.parse(input)
  if (!configuration.enabled) throw new Error('Local model adapter is disabled')
  if (!configuration.launchedByHuman) throw new Error('A human must explicitly launch and acknowledge the local proxy')
  const host = new URL(configuration.baseUrl).hostname
  if (host !== '127.0.0.1' && host !== 'localhost' && host !== '::1') {
    throw new Error('Local model adapter must use a loopback URL')
  }
  return configuration
}

interface LocalChatCompletion {
  id?: string
  choices?: Array<{ message?: { content?: string } }>
  usage?: { prompt_tokens?: number; completion_tokens?: number }
}

export async function requestLocalOpenAiCompatibleAnalysis(
  configurationInput: unknown,
  request: AnalysisRequestV2,
  fetcher: typeof fetch = fetch
): Promise<AnalysisResponse> {
  const configuration = assertLocalProxyConfiguration(configurationInput)
  const legacyRequest = toLegacyAnalysisRequest(request)
  const startedAt = performance.now()
  const response = await fetcher(`${configuration.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: configuration.model,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: buildPaperPrompt(legacyRequest) }
      ],
      response_format: { type: 'json_object' },
      stream: false
    })
  })
  if (!response.ok) throw new Error(`Local model proxy returned HTTP ${response.status}`)
  const completion = await response.json() as LocalChatCompletion
  const content = completion.choices?.[0]?.message?.content
  if (!content) throw new Error('Local model proxy returned no structured content')
  const draft = aiDraftSchema.parse(JSON.parse(content) as unknown)
  return analysisResponseSchema.parse({
    draft,
    analysis: {
      mode: 'live',
      provider: 'local-openai-compatible',
      model: configuration.model,
      reasoningEffort: 'proxy-defined',
      promptVersion: `${PROMPT_VERSION}/local-proxy`,
      promptDigest: await sha256Text(buildSystemPrompt()),
      responseId: completion.id ?? `local-${request.paper.sha256.slice(0, 12)}`,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Math.max(0, performance.now() - startedAt),
      store: false
    }
  })
}
