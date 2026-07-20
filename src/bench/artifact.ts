import { z } from 'zod'
import {
  canExportAdjudicated,
  completeReview,
  type FieldReview,
  type ReviewState
} from './adjudication'
import { buildNarrative } from './adjudication'
import { sha256Text } from './hash'
import {
  aiDraftSchema,
  benchmarkDefinitionSchema,
  challengeIdSchema,
  citationVerificationSchema,
  confidenceSchema,
  demandKeySchema,
  verdictSchema,
  type AiDraft,
  type BenchmarkDefinition,
  type ChallengeId,
  type DemandKey,
  type Verdict,
  type VerifiedCitation
} from './schema'

const reviewDecisionSchema = z.enum(['pending', 'accepted', 'revised', 'rejected'])

const fieldReviewSchema = z.object({
  decision: reviewDecisionSchema,
  aiValue: z.string(),
  adjudicatedValue: z.string().optional(),
  reason: z.string().optional()
})

export const reviewStateSchema = z.object({
  reviewer: z.string().min(1),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  challenges: z.record(challengeIdSchema, z.object({
    fields: z.record(demandKeySchema, fieldReviewSchema),
    verdict: fieldReviewSchema
  }))
})

export const analysisMetadataSchema = z.object({
  mode: z.enum(['mock', 'live']),
  provider: z.string().min(1),
  model: z.string().min(1),
  reasoningEffort: z.string().min(1),
  promptVersion: z.string().min(1),
  promptDigest: z.string().regex(/^[a-f0-9]{64}$/),
  responseId: z.string().min(1),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  store: z.literal(false)
})

export const paperSourceSchema = z.object({
  fileName: z.string().min(1),
  byteSize: z.number().int().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  textSha256: z.string().regex(/^[a-f0-9]{64}$/),
  pageCount: z.number().int().positive(),
  characterCount: z.number().int().positive(),
  title: z.string().optional(),
  authors: z.array(z.string()).optional(),
  year: z.number().int().optional(),
  doi: z.string().optional(),
  sourceUrl: z.string().url().optional()
})

export const verifiedCitationArtifactSchema = z.object({
  id: z.string().min(1),
  pdfPage: z.number().int().positive(),
  printedPageLabel: z.string().optional(),
  quote: z.string().min(1),
  locationHint: z.string().optional(),
  supportsField: z.string().min(1),
  verification: citationVerificationSchema,
  verifiedAt: z.string().datetime()
})

const experimentSchema = z.object({
  challengeId: challengeIdSchema,
  title: z.string().min(1),
  prediction: z.string().min(1),
  witness: z.string().min(1),
  extractionConfidence: confidenceSchema
})

export const evaluationRunSchema = z.object({
  schemaVersion: z.literal('mac-evaluation-run/v1'),
  runId: z.string().uuid(),
  artifactStatus: z.enum(['unadjudicated', 'adjudicated']),
  appVersion: z.literal('0.1.0-alpha.1'),
  sourceCommit: z.string().min(1),
  createdAt: z.string().datetime(),
  paper: paperSourceSchema,
  benchmark: benchmarkDefinitionSchema,
  benchmarkDigest: z.string().regex(/^[a-f0-9]{64}$/),
  analysis: analysisMetadataSchema,
  aiDraft: aiDraftSchema,
  verifiedCitations: z.array(verifiedCitationArtifactSchema),
  humanAdjudication: reviewStateSchema,
  finalVerdicts: z.record(challengeIdSchema, verdictSchema).optional(),
  experimentQueue: z.array(experimentSchema),
  summary: z.string().min(1),
  artifactSha256: z.string().regex(/^[a-f0-9]{64}$/)
})

export type AnalysisMetadata = z.infer<typeof analysisMetadataSchema>
export type EvaluationRun = z.infer<typeof evaluationRunSchema>
export type PaperSource = z.infer<typeof paperSourceSchema>

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortJson(child)])
    )
  }
  return value
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJson(value))
}

function finalFieldValue(field: FieldReview): string | undefined {
  if (field.decision === 'accepted') return field.aiValue
  if (field.decision === 'revised') return field.adjudicatedValue
  return undefined
}

function finalVerdict(field: FieldReview): Verdict {
  if (field.decision === 'accepted') return verdictSchema.parse(field.aiValue)
  if (field.decision === 'revised') return verdictSchema.parse(field.adjudicatedValue)
  return 'insufficient_evidence'
}

function buildExperimentQueue(draft: AiDraft, review: ReviewState) {
  return draft.challenges.flatMap(challenge => {
    const challengeReview = review.challenges[challenge.challengeId]
    const prediction = finalFieldValue(challengeReview.fields.novelPrediction)
    const witness = finalFieldValue(challengeReview.fields.measurableWitness)
    if (!prediction || !witness) return []
    return [{
      challengeId: challenge.challengeId,
      title: `${challenge.challengeId}: ${challenge.novelPrediction.intervention}`,
      prediction,
      witness,
      extractionConfidence: challenge.extractionConfidence
    }]
  })
}

function acceptedCitationsAreVerified(
  draft: AiDraft,
  review: ReviewState,
  verifiedCitations: VerifiedCitation[]
): boolean {
  const verificationById = new Map(
    verifiedCitations.map(citation => [citation.id, citation.verification])
  )

  return draft.challenges.every(challenge => {
    const challengeReview = review.challenges[challenge.challengeId]
    return demandKeySchema.options.every(field => {
      if (challengeReview.fields[field].decision !== 'accepted') return true
      const citations = challenge[field].citations
      return citations.every(citation => {
        const verification = verificationById.get(citation.id)
        return verification === 'exact' || verification === 'normalized'
      })
    })
  })
}

interface CreateEvaluationRunInput {
  runId: string
  createdAt?: string
  sourceCommit: string
  paper: PaperSource
  benchmark: BenchmarkDefinition
  draft: AiDraft
  verifiedCitations: VerifiedCitation[]
  review: ReviewState
  analysis: AnalysisMetadata
}

export async function createEvaluationRun(input: CreateEvaluationRunInput): Promise<EvaluationRun> {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const adjudicated = canExportAdjudicated(input.review) &&
    acceptedCitationsAreVerified(input.draft, input.review, input.verifiedCitations)
  const humanAdjudication = adjudicated
    ? completeReview(input.review, input.review.completedAt ?? createdAt)
    : structuredClone(input.review)
  const benchmarkDigest = await sha256Text(stableStringify(input.benchmark))
  const experimentQueue = adjudicated ? buildExperimentQueue(input.draft, humanAdjudication) : []

  let finalVerdicts: Record<ChallengeId, Verdict> | undefined
  let summary = 'Unadjudicated AI draft. No scientific verdict has been sealed by a human reviewer.'

  if (adjudicated) {
    finalVerdicts = Object.fromEntries(
      challengeIdSchema.options.map(challengeId => [
        challengeId,
        finalVerdict(humanAdjudication.challenges[challengeId].verdict)
      ])
    ) as Record<ChallengeId, Verdict>
    summary = buildNarrative({
      benchmarkVersion: input.benchmark.version,
      theoryName: input.draft.theory.name,
      verdicts: finalVerdicts,
      experimentCount: experimentQueue.length
    })
  }

  const unsignedRun = {
    schemaVersion: 'mac-evaluation-run/v1' as const,
    runId: input.runId,
    artifactStatus: adjudicated ? 'adjudicated' as const : 'unadjudicated' as const,
    appVersion: '0.1.0-alpha.1' as const,
    sourceCommit: input.sourceCommit,
    createdAt,
    paper: input.paper,
    benchmark: input.benchmark,
    benchmarkDigest,
    analysis: input.analysis,
    aiDraft: input.draft,
    verifiedCitations: input.verifiedCitations,
    humanAdjudication,
    ...(finalVerdicts ? { finalVerdicts } : {}),
    experimentQueue,
    summary
  }

  const artifactSha256 = await sha256Text(stableStringify(unsignedRun))
  return evaluationRunSchema.parse({ ...unsignedRun, artifactSha256 })
}

export function evaluationFileName(run: EvaluationRun): string {
  const title = run.paper.title ?? run.paper.fileName.replace(/\.pdf$/i, '')
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'theory-paper'
  const marker = run.artifactStatus === 'adjudicated' ? 'ADJUDICATED' : 'DRAFT'
  return `cylon-detector_${slug}_${run.benchmark.version}_${run.runId}_${marker}.json`
}

export async function validateEvaluationRunArtifact(input: unknown): Promise<EvaluationRun> {
  const run = evaluationRunSchema.parse(input)
  const { artifactSha256, ...unsignedRun } = run
  const expectedDigest = await sha256Text(stableStringify(unsignedRun))
  if (artifactSha256 !== expectedDigest) {
    throw new Error('The evidence artifact digest does not match its contents.')
  }
  return run
}

export function reviewFieldKeys(): DemandKey[] {
  return [...demandKeySchema.options]
}
