import { z } from 'zod'
import {
  evaluationRunSchema,
  paperSourceSchema,
  analysisMetadataSchema,
  stableStringify,
  validateEvaluationRunArtifact,
  verifiedCitationArtifactSchema,
  type EvaluationRun
} from '../artifact'
import { sha256Text } from '../hash'
import {
  citationDraftSchema,
  confidenceSchema,
  verdictSchema
} from '../schema'
import {
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema,
  demandKeyV2Schema,
  integrityDigestSchema,
  slugSchema,
  type DemandKeyV2
} from './contracts'
import { defaultBenchmarkV2, defaultChallengeDefinitions } from './defaultRegistry'

const supportedTextV2Schema = z.object({
  text: z.string().min(1),
  citations: z.array(citationDraftSchema)
})

const challengeDraftV2Schema = z.object({
  challengeId: slugSchema,
  explanation: supportedTextV2Schema,
  mechanism: supportedTextV2Schema.extend({ steps: z.array(z.string().min(1)).min(1) }),
  novelPrediction: supportedTextV2Schema.extend({
    intervention: z.string().min(1),
    independentVariable: z.string().min(1),
    dependentMeasure: z.string().min(1),
    populationOrSystem: z.string().min(1),
    directionalOutcome: z.string().min(1)
  }),
  falsifier: supportedTextV2Schema.extend({
    incompatibleObservation: z.string().min(1),
    rationale: z.string().min(1)
  }),
  measurableWitness: supportedTextV2Schema.extend({
    observable: z.string().min(1),
    method: z.string().min(1),
    contrast: z.string().min(1),
    expectedSignature: z.string().min(1)
  }),
  evasionFlags: z.array(z.string()),
  proposedVerdict: verdictSchema,
  verdictRationale: z.string().min(1),
  extractionConfidence: confidenceSchema
})

export const aiDraftV2Schema = z.object({
  theory: z.object({
    name: z.string().min(1),
    summary: z.string().min(1),
    centralClaims: z.array(supportedTextV2Schema)
  }),
  challenges: z.array(challengeDraftV2Schema).min(1).superRefine((challenges, context) => {
    const ids = challenges.map(challenge => challenge.challengeId)
    if (new Set(ids).size !== ids.length) {
      context.addIssue({ code: 'custom', message: 'Challenge drafts must have unique IDs' })
    }
  })
})

export const reviewEventV2Schema = z.object({
  eventId: z.string().min(1),
  sequence: z.number().int().positive(),
  recordedAt: z.string().datetime(),
  reviewerAlias: z.string().min(1),
  claimId: z.string().min(1),
  decision: z.enum(['accepted', 'revised', 'rejected']),
  modelValue: z.string(),
  humanValue: z.string().optional(),
  reason: z.string().optional(),
  lockedAt: z.string().datetime().optional()
}).superRefine((event, context) => {
  if (event.decision === 'revised' && !event.humanValue?.trim()) {
    context.addIssue({ code: 'custom', message: 'A revision requires a human value' })
  }
  if ((event.decision === 'revised' || event.decision === 'rejected') && !event.reason?.trim()) {
    context.addIssue({ code: 'custom', message: 'A revision or rejection requires a reason' })
  }
})

const sourceQuoteSchema = z.object({
  citationId: z.string().min(1),
  quote: z.string().min(1).max(600),
  pdfPage: z.number().int().positive(),
  printedPageLabel: z.string().optional(),
  verification: z.enum(['exact', 'normalized', 'not_found'])
})

const finalCallSchema = z.object({
  decision: z.enum(['accepted', 'revised', 'rejected']),
  value: z.string().optional(),
  reason: z.string().optional(),
  eventId: z.string().min(1)
})

export const claimLedgerRowSchema = z.object({
  claimId: z.string().min(1),
  sourceQuotes: z.array(sourceQuoteSchema),
  challenge: z.object({ id: slugSchema, version: z.string().min(1) }),
  demand: demandKeyV2Schema,
  modelDraft: z.string(),
  humanEventIds: z.array(z.string().min(1)),
  finalCall: finalCallSchema.optional()
})

const stressFractureSchema = z.object({
  challengeId: slugSchema,
  modelVerdict: verdictSchema,
  humanVerdict: verdictSchema.optional(),
  humanDecision: z.enum(['accepted', 'revised', 'rejected']).optional(),
  rationale: z.string().optional()
})

const witnessProtocolSchema = z.object({
  challengeId: slugSchema,
  prediction: z.string().min(1),
  intervention: z.string().min(1),
  observable: z.string().min(1),
  method: z.string().min(1),
  contrast: z.string().min(1),
  expectedSignature: z.string().min(1),
  extractionConfidence: confidenceSchema
})

const benchmarkSnapshotSchema = z.object({
  definition: benchmarkDefinitionV2Schema,
  challenges: z.array(challengeDefinitionV2Schema).min(1)
})

export const evaluationRunV2Schema = z.object({
  schemaVersion: z.literal('mac-evaluation-run/v2'),
  runId: z.string().uuid(),
  artifactStatus: z.enum(['unadjudicated', 'adjudicated']),
  appVersion: z.string().min(1),
  sourceCommit: z.string().min(1),
  createdAt: z.string().datetime(),
  paper: paperSourceSchema,
  benchmark: benchmarkSnapshotSchema,
  analysis: analysisMetadataSchema,
  aiDraft: aiDraftV2Schema,
  verifiedCitations: z.array(verifiedCitationArtifactSchema),
  claimLedger: z.array(claimLedgerRowSchema),
  reviewEvents: z.array(reviewEventV2Schema).superRefine((events, context) => {
    const ids = new Set<string>()
    events.forEach((event, index) => {
      if (event.sequence !== index + 1) {
        context.addIssue({ code: 'custom', message: 'Review event sequences must be contiguous and append-only' })
      }
      if (ids.has(event.eventId)) {
        context.addIssue({ code: 'custom', message: 'Review event IDs must be unique' })
      }
      ids.add(event.eventId)
    })
  }),
  stressFractureMap: z.array(stressFractureSchema),
  witnessProtocols: z.array(witnessProtocolSchema),
  summary: z.string().min(1),
  legacyImport: z.object({
    schemaVersion: z.literal('mac-evaluation-run/v1'),
    originalIntegrityDigest: integrityDigestSchema
  }).optional(),
  integrityDigest: integrityDigestSchema
})

export type EvaluationRunV2 = z.infer<typeof evaluationRunV2Schema>
export type ReviewEventV2 = z.infer<typeof reviewEventV2Schema>

export function appendReviewEvent(
  history: readonly ReviewEventV2[],
  candidate: ReviewEventV2
): ReviewEventV2[] {
  const event = reviewEventV2Schema.parse(candidate)
  if (event.sequence !== history.length + 1) {
    throw new Error(`Review event must use next sequence ${history.length + 1}`)
  }
  if (history.some(prior => prior.eventId === event.eventId)) {
    throw new Error('Review event ID already exists')
  }
  return [...history, event]
}

function claimId(runId: string, challengeId: string, demand: DemandKeyV2): string {
  return `claim:${runId}:${challengeId}:${demand}`
}

function fieldText(challenge: EvaluationRun['aiDraft']['challenges'][number], demand: DemandKeyV2): string {
  return challenge[demand].text
}

function upgradeReviewEvents(run: EvaluationRun): ReviewEventV2[] {
  let sequence = 0
  const recordedAt = run.humanAdjudication.completedAt ?? run.humanAdjudication.startedAt
  const events: ReviewEventV2[] = []
  for (const challenge of run.aiDraft.challenges) {
    const challengeReview = run.humanAdjudication.challenges[challenge.challengeId]
    for (const demand of demandKeyV2Schema.options) {
      const review = challengeReview.fields[demand]
      if (review.decision === 'pending') continue
      sequence += 1
      const id = claimId(run.runId, challenge.challengeId, demand)
      events.push(reviewEventV2Schema.parse({
        eventId: `event:${id}:${sequence}`,
        sequence,
        recordedAt,
        reviewerAlias: run.humanAdjudication.reviewer,
        claimId: id,
        decision: review.decision,
        modelValue: review.aiValue,
        ...(review.adjudicatedValue ? { humanValue: review.adjudicatedValue } : {}),
        ...(review.reason ? { reason: review.reason } : {})
      }))
    }
    const verdict = challengeReview.verdict
    if (verdict.decision !== 'pending') {
      sequence += 1
      const id = `verdict:${run.runId}:${challenge.challengeId}`
      events.push(reviewEventV2Schema.parse({
        eventId: `event:${id}:${sequence}`,
        sequence,
        recordedAt,
        reviewerAlias: run.humanAdjudication.reviewer,
        claimId: id,
        decision: verdict.decision,
        modelValue: verdict.aiValue,
        ...(verdict.adjudicatedValue ? { humanValue: verdict.adjudicatedValue } : {}),
        ...(verdict.reason ? { reason: verdict.reason } : {})
      }))
    }
  }
  return events
}

function upgradedClaimLedger(run: EvaluationRun, events: ReviewEventV2[]) {
  const citations = new Map(run.verifiedCitations.map(citation => [citation.id, citation]))
  return run.aiDraft.challenges.flatMap(challenge =>
    demandKeyV2Schema.options.map(demand => {
      const id = claimId(run.runId, challenge.challengeId, demand)
      const humanEvents = events.filter(event => event.claimId === id)
      const finalEvent = humanEvents.at(-1)
      return claimLedgerRowSchema.parse({
        claimId: id,
        sourceQuotes: challenge[demand].citations.flatMap(citation => {
          const verified = citations.get(citation.id)
          return verified ? [{
            citationId: verified.id,
            quote: verified.quote,
            pdfPage: verified.pdfPage,
            ...(verified.printedPageLabel ? { printedPageLabel: verified.printedPageLabel } : {}),
            verification: verified.verification
          }] : []
        }),
        challenge: { id: challenge.challengeId, version: '1.0.0' },
        demand,
        modelDraft: fieldText(challenge, demand),
        humanEventIds: humanEvents.map(event => event.eventId),
        ...(finalEvent ? {
          finalCall: {
            decision: finalEvent.decision,
            ...(finalEvent.decision === 'accepted' ? { value: finalEvent.modelValue } : {}),
            ...(finalEvent.humanValue ? { value: finalEvent.humanValue } : {}),
            ...(finalEvent.reason ? { reason: finalEvent.reason } : {}),
            eventId: finalEvent.eventId
          }
        } : {})
      })
    })
  )
}

async function upgradeV1(run: EvaluationRun, eventOverride?: ReviewEventV2[]): Promise<EvaluationRunV2> {
  const reviewEvents = eventOverride?.length
    ? eventOverride.map(event => reviewEventV2Schema.parse(event))
    : upgradeReviewEvents(run)
  const claimLedger = upgradedClaimLedger(run, reviewEvents)
  const stressFractureMap = run.aiDraft.challenges.map(challenge => {
    const review = run.humanAdjudication.challenges[challenge.challengeId].verdict
    return {
      challengeId: challenge.challengeId,
      modelVerdict: challenge.proposedVerdict,
      ...(review.decision !== 'pending' ? {
        humanDecision: review.decision,
        humanVerdict: review.decision === 'accepted'
          ? challenge.proposedVerdict
          : review.decision === 'revised'
            ? verdictSchema.parse(review.adjudicatedValue)
            : 'insufficient_evidence' as const,
        ...(review.reason ? { rationale: review.reason } : {})
      } : {})
    }
  })
  const witnessProtocols = run.aiDraft.challenges.map(challenge => ({
    challengeId: challenge.challengeId,
    prediction: challenge.novelPrediction.text,
    intervention: challenge.novelPrediction.intervention,
    observable: challenge.measurableWitness.observable,
    method: challenge.measurableWitness.method,
    contrast: challenge.measurableWitness.contrast,
    expectedSignature: challenge.measurableWitness.expectedSignature,
    extractionConfidence: challenge.extractionConfidence
  }))
  const humanCalls = stressFractureMap.flatMap(fracture => fracture.humanVerdict
    ? [`${fracture.challengeId.replace(/-/g, ' ')} — ${fracture.humanVerdict.replace(/_/g, ' ')}`]
    : [])
  const reviewState = humanCalls.length === stressFractureMap.length
    ? 'human-reviewed'
    : humanCalls.length > 0
      ? 'partially reviewed'
      : 'unadjudicated'
  const summary = `${defaultBenchmarkV2.title} ${defaultBenchmarkV2.version} recorded a ${reviewState} adversarial evidence trail for ${run.aiDraft.theory.name} across ${stressFractureMap.length} challenges. ${humanCalls.length > 0 ? `Categorical calls: ${humanCalls.join('; ')}.` : 'No final human calls have been recorded.'} The canonical receipt retains ${witnessProtocols.length} witness protocols. No aggregate score or automatic consciousness verdict was produced.`

  const unsigned = {
    schemaVersion: 'mac-evaluation-run/v2' as const,
    runId: run.runId,
    artifactStatus: run.artifactStatus,
    appVersion: '0.2.0-beta.1',
    sourceCommit: run.sourceCommit,
    createdAt: run.createdAt,
    paper: run.paper,
    benchmark: {
      definition: defaultBenchmarkV2,
      challenges: defaultChallengeDefinitions
    },
    analysis: run.analysis,
    aiDraft: run.aiDraft,
    verifiedCitations: run.verifiedCitations,
    claimLedger,
    reviewEvents,
    stressFractureMap,
    witnessProtocols,
    summary,
    legacyImport: {
      schemaVersion: 'mac-evaluation-run/v1' as const,
      originalIntegrityDigest: run.artifactSha256
    }
  }
  const integrityDigest = await sha256Text(stableStringify(unsigned))
  return evaluationRunV2Schema.parse({ ...unsigned, integrityDigest })
}

export async function validateEvaluationRunV2(input: unknown): Promise<EvaluationRunV2> {
  const run = evaluationRunV2Schema.parse(input)
  const { integrityDigest, ...unsigned } = run
  const expected = await sha256Text(stableStringify(unsigned))
  if (integrityDigest !== expected) {
    throw new Error('The canonical receipt integrity digest does not match its contents.')
  }
  return run
}

export async function normalizeEvaluationRun(
  input: unknown,
  eventOverride?: ReviewEventV2[]
): Promise<EvaluationRunV2> {
  if (input && typeof input === 'object' && 'schemaVersion' in input && input.schemaVersion === 'mac-evaluation-run/v2') {
    return validateEvaluationRunV2(input)
  }
  const v1 = evaluationRunSchema.parse(input)
  await validateEvaluationRunArtifact(v1)
  return upgradeV1(v1, eventOverride)
}

export function evaluationFileNameV2(run: EvaluationRunV2): string {
  const title = run.paper.title ?? run.paper.fileName.replace(/\.pdf$/i, '')
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'theory-paper'
  const marker = run.artifactStatus === 'adjudicated' ? 'ADJUDICATED' : 'DRAFT'
  return `cylon-detector_${slug}_${run.benchmark.definition.version}_${run.runId}_${marker}.json`
}
