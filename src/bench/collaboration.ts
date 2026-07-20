import { z } from 'zod'
import { paperSourceSchema, stableStringify } from './artifact'
import { sha256Text } from './hash'
import { integrityDigestSchema, slugSchema } from './v2/contracts'
import type { EvaluationRunV2 } from './v2/artifact'

const reviewJudgmentSchema = z.enum([
  'supported',
  'strained',
  'unsupported',
  'insufficient_evidence'
])
const confidenceSchema = z.enum(['low', 'medium', 'high'])

const blindCommitmentSchema = z.object({
  blindClaimId: z.string().min(1),
  challengeId: slugSchema,
  demand: z.string().min(1),
  commitment: z.string().min(1),
  evidenceBindings: z.array(z.object({
    redactedLabel: z.literal('Evidence redacted until provenance reveal'),
    evidenceDigest: integrityDigestSchema
  }))
})

export const blindReviewPacketSchema = z.object({
  schemaVersion: z.literal('blind-review-packet/v1'),
  packetId: z.string().uuid(),
  alias: z.string().min(1),
  createdAt: z.string().datetime(),
  blinding: z.literal('partial'),
  blindingNotice: z.string().min(1),
  benchmark: z.object({ id: slugSchema, version: z.string().min(1), integrityDigest: integrityDigestSchema }),
  sourceBindingDigest: integrityDigestSchema,
  receiptBindingDigest: integrityDigestSchema,
  commitments: z.array(blindCommitmentSchema).min(1),
  integrityDigest: integrityDigestSchema
})

export const provenanceEnvelopeSchema = z.object({
  schemaVersion: z.literal('provenance-envelope/v1'),
  envelopeId: z.string().uuid(),
  packetIntegrityDigest: integrityDigestSchema,
  createdAt: z.string().datetime(),
  paper: paperSourceSchema,
  theoryName: z.string().min(1),
  analysisIdentity: z.object({
    provider: z.string().min(1),
    model: z.string().min(1),
    promptVersion: z.string().min(1),
    promptDigest: integrityDigestSchema
  }),
  evidence: z.array(z.object({
    blindClaimId: z.string().min(1),
    originalClaimId: z.string().min(1),
    sources: z.array(z.object({
      citationId: z.string().min(1),
      quote: z.string().min(1).max(600),
      pdfPage: z.number().int().positive(),
      verification: z.enum(['exact', 'normalized', 'not_found']),
      evidenceDigest: integrityDigestSchema
    }))
  })),
  integrityDigest: integrityDigestSchema
})

export const reviewCallSchema = z.object({
  blindClaimId: z.string().min(1),
  judgment: reviewJudgmentSchema,
  confidence: confidenceSchema,
  responseTimeMs: z.number().int().nonnegative(),
  reason: z.string().min(1)
})

const blindLockSchema = z.object({
  lockedAt: z.string().datetime(),
  calls: z.array(reviewCallSchema).min(1),
  integrityDigest: integrityDigestSchema
})

const provenanceDeltaSchema = z.object({
  blindClaimId: z.string().min(1),
  changed: z.boolean(),
  firstJudgment: reviewJudgmentSchema,
  secondJudgment: reviewJudgmentSchema,
  firstConfidence: confidenceSchema,
  secondConfidence: confidenceSchema,
  firstResponseTimeMs: z.number().int().nonnegative(),
  secondResponseTimeMs: z.number().int().nonnegative(),
  humanReason: z.string().min(1)
})

export const reviewContributionSchema = z.object({
  schemaVersion: z.literal('review-contribution/v1'),
  contributionId: z.string().uuid(),
  packetIntegrityDigest: integrityDigestSchema,
  reviewerAlias: z.string().min(1),
  blindLock: blindLockSchema,
  provenanceReveal: z.object({
    envelopeIntegrityDigest: integrityDigestSchema,
    revealedAt: z.string().datetime(),
    secondCalls: z.array(reviewCallSchema).min(1),
    deltas: z.array(provenanceDeltaSchema).min(1)
  }).optional(),
  integrityDigest: integrityDigestSchema
})

export const reviewBundleSchema = z.object({
  schemaVersion: z.literal('review-bundle/v1'),
  bundleId: z.string().uuid(),
  createdAt: z.string().datetime(),
  packet: blindReviewPacketSchema,
  contributions: z.array(reviewContributionSchema).min(1),
  disagreements: z.array(z.object({
    blindClaimId: z.string().min(1),
    calls: z.array(z.object({
      reviewerAlias: z.string().min(1),
      judgment: reviewJudgmentSchema,
      confidence: confidenceSchema,
      reason: z.string().min(1)
    })).min(1)
  })),
  dissentNotice: z.literal('Calls are preserved independently. No score, average, or synthetic consensus is produced.'),
  integrityDigest: integrityDigestSchema
})

export type BlindReviewPacket = z.infer<typeof blindReviewPacketSchema>
export type ProvenanceEnvelope = z.infer<typeof provenanceEnvelopeSchema>
export type ReviewCall = z.infer<typeof reviewCallSchema>
export type ReviewContribution = z.infer<typeof reviewContributionSchema>
export type ReviewBundle = z.infer<typeof reviewBundleSchema>

async function seal<T extends object>(unsigned: T): Promise<T & { integrityDigest: string }> {
  return { ...unsigned, integrityDigest: await sha256Text(stableStringify(unsigned)) }
}

async function validateSeal<T extends { integrityDigest: string }>(value: T): Promise<T> {
  const { integrityDigest, ...unsigned } = value
  if (await sha256Text(stableStringify(unsigned)) !== integrityDigest) {
    throw new Error('Portable artifact integrity digest mismatch')
  }
  return value
}

function packetIdForRun(runId: string): string {
  return runId
}

export async function createBlindReviewPacket(
  run: EvaluationRunV2,
  alias: string,
  createdAt = run.createdAt
): Promise<BlindReviewPacket> {
  const commitments = await Promise.all(run.claimLedger.map(async (row, index) => ({
    blindClaimId: `blind:${index + 1}:${(await sha256Text(row.claimId)).slice(0, 16)}`,
    challengeId: row.challenge.id,
    demand: row.demand,
    commitment: row.finalCall?.value ?? row.modelDraft,
    evidenceBindings: await Promise.all(row.sourceQuotes.map(async source => ({
      redactedLabel: 'Evidence redacted until provenance reveal' as const,
      evidenceDigest: await sha256Text(stableStringify({
        originalClaimId: row.claimId,
        citationId: source.citationId,
        pdfPage: source.pdfPage,
        quote: source.quote,
        sourceDigest: run.paper.sha256
      }))
    })))
  })))
  const sourceBindingDigest = await sha256Text(stableStringify({
    paperSha256: run.paper.sha256,
    textSha256: run.paper.textSha256,
    benchmarkDigest: run.benchmark.definition.integrityDigest
  }))
  const unsigned = {
    schemaVersion: 'blind-review-packet/v1' as const,
    packetId: packetIdForRun(run.runId),
    alias,
    createdAt,
    blinding: 'partial' as const,
    blindingNotice: 'Partial blinding only: theory language can reveal identity. Paper, author, institution, DOI, source quotes, pages, and model identity are withheld.',
    benchmark: {
      id: run.benchmark.definition.id,
      version: run.benchmark.definition.version,
      integrityDigest: run.benchmark.definition.integrityDigest
    },
    sourceBindingDigest,
    receiptBindingDigest: run.integrityDigest,
    commitments
  }
  return blindReviewPacketSchema.parse(await seal(unsigned))
}

export async function validateBlindReviewPacket(input: unknown): Promise<BlindReviewPacket> {
  return validateSeal(blindReviewPacketSchema.parse(input))
}

export async function createProvenanceEnvelope(
  run: EvaluationRunV2,
  packetInput: BlindReviewPacket,
  createdAt = run.createdAt
): Promise<ProvenanceEnvelope> {
  const packet = await validateBlindReviewPacket(packetInput)
  if (packet.receiptBindingDigest !== run.integrityDigest) {
    throw new Error('Packet is not bound to this canonical receipt')
  }
  const evidence = await Promise.all(packet.commitments.map(async commitment => {
    const index = packet.commitments.indexOf(commitment)
    const row = run.claimLedger[index]
    return {
      blindClaimId: commitment.blindClaimId,
      originalClaimId: row.claimId,
      sources: await Promise.all(row.sourceQuotes.map(async source => ({
        citationId: source.citationId,
        quote: source.quote,
        pdfPage: source.pdfPage,
        verification: source.verification,
        evidenceDigest: await sha256Text(stableStringify({
          originalClaimId: row.claimId,
          citationId: source.citationId,
          pdfPage: source.pdfPage,
          quote: source.quote,
          sourceDigest: run.paper.sha256
        }))
      })))
    }
  }))
  const unsigned = {
    schemaVersion: 'provenance-envelope/v1' as const,
    envelopeId: run.runId,
    packetIntegrityDigest: packet.integrityDigest,
    createdAt,
    paper: run.paper,
    theoryName: run.aiDraft.theory.name,
    analysisIdentity: {
      provider: run.analysis.provider,
      model: run.analysis.model,
      promptVersion: run.analysis.promptVersion,
      promptDigest: run.analysis.promptDigest
    },
    evidence
  }
  return provenanceEnvelopeSchema.parse(await seal(unsigned))
}

export async function validateReviewContribution(input: unknown): Promise<ReviewContribution> {
  const contribution = reviewContributionSchema.parse(input)
  await validateSeal(contribution)
  await validateSeal(contribution.blindLock)
  return contribution
}

export async function validateProvenanceEnvelope(input: unknown): Promise<ProvenanceEnvelope> {
  return validateSeal(provenanceEnvelopeSchema.parse(input))
}

export async function validateReviewBundle(input: unknown): Promise<ReviewBundle> {
  return validateSeal(reviewBundleSchema.parse(input))
}

export async function lockBlindContribution(
  packetInput: BlindReviewPacket,
  reviewerAlias: string,
  callInputs: ReviewCall[],
  lockedAt = new Date().toISOString(),
  contributionId = crypto.randomUUID()
): Promise<ReviewContribution> {
  const packet = await validateBlindReviewPacket(packetInput)
  const knownClaims = new Set(packet.commitments.map(commitment => commitment.blindClaimId))
  const calls = callInputs.map(call => reviewCallSchema.parse(call))
  if (calls.some(call => !knownClaims.has(call.blindClaimId))) throw new Error('Review call references an unknown blind claim')
  if (new Set(calls.map(call => call.blindClaimId)).size !== calls.length) throw new Error('A blind claim can only be called once per lock')
  const blindLock = await seal({ lockedAt, calls })
  const unsigned = {
    schemaVersion: 'review-contribution/v1' as const,
    contributionId,
    packetIntegrityDigest: packet.integrityDigest,
    reviewerAlias,
    blindLock
  }
  return reviewContributionSchema.parse(await seal(unsigned))
}

export async function revealContribution(
  contributionInput: ReviewContribution,
  envelopeInput: ProvenanceEnvelope,
  secondCallInputs: ReviewCall[],
  revealedAt = new Date().toISOString()
): Promise<ReviewContribution> {
  const contribution = await validateReviewContribution(contributionInput)
  const envelope = await validateProvenanceEnvelope(envelopeInput)
  if (envelope.packetIntegrityDigest !== contribution.packetIntegrityDigest) {
    throw new Error('Provenance envelope belongs to a different blind packet')
  }
  if (contribution.provenanceReveal) throw new Error('Provenance was already revealed for this contribution')
  const secondCalls = secondCallInputs.map(call => reviewCallSchema.parse(call))
  const firstByClaim = new Map(contribution.blindLock.calls.map(call => [call.blindClaimId, call]))
  const deltas = secondCalls.map(second => {
    const first = firstByClaim.get(second.blindClaimId)
    if (!first) throw new Error('Every second call must match a locked first call')
    return {
      blindClaimId: second.blindClaimId,
      changed: first.judgment !== second.judgment || first.confidence !== second.confidence,
      firstJudgment: first.judgment,
      secondJudgment: second.judgment,
      firstConfidence: first.confidence,
      secondConfidence: second.confidence,
      firstResponseTimeMs: first.responseTimeMs,
      secondResponseTimeMs: second.responseTimeMs,
      humanReason: second.reason
    }
  })
  const { integrityDigest: _priorDigest, ...base } = contribution
  return reviewContributionSchema.parse(await seal({
    ...base,
    provenanceReveal: {
      envelopeIntegrityDigest: envelope.integrityDigest,
      revealedAt,
      secondCalls,
      deltas
    }
  }))
}

export async function mergeReviewContributions(
  packetInput: BlindReviewPacket,
  contributionInputs: ReviewContribution[],
  createdAt = new Date().toISOString(),
  bundleId = crypto.randomUUID()
): Promise<ReviewBundle> {
  const packet = await validateBlindReviewPacket(packetInput)
  const contributions = await Promise.all(contributionInputs.map(validateReviewContribution))
  if (contributions.some(contribution => contribution.packetIntegrityDigest !== packet.integrityDigest)) {
    throw new Error('Every contribution must belong to the same blind packet')
  }
  const disagreements = packet.commitments.flatMap(commitment => {
    const calls = contributions.flatMap(contribution => {
      const call = contribution.blindLock.calls.find(candidate => candidate.blindClaimId === commitment.blindClaimId)
      return call ? [{
        reviewerAlias: contribution.reviewerAlias,
        judgment: call.judgment,
        confidence: call.confidence,
        reason: call.reason
      }] : []
    })
    return calls.length ? [{ blindClaimId: commitment.blindClaimId, calls }] : []
  })
  const unsigned = {
    schemaVersion: 'review-bundle/v1' as const,
    bundleId,
    createdAt,
    packet,
    contributions,
    disagreements,
    dissentNotice: 'Calls are preserved independently. No score, average, or synthetic consensus is produced.' as const
  }
  return reviewBundleSchema.parse(await seal(unsigned))
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character)
}

export function generateThreeVoiceReport(
  packet: BlindReviewPacket,
  bundle: ReviewBundle,
  proponentResponse: string,
  theoryName = packet.alias
): string {
  const commitments = packet.commitments.map(commitment => `<li><b>${escapeHtml(commitment.challengeId)} / ${escapeHtml(commitment.demand)}</b><p>${escapeHtml(commitment.commitment)}</p></li>`).join('')
  const reviewers = bundle.contributions.map(contribution => `<article><h3>${escapeHtml(contribution.reviewerAlias)}</h3><ul>${contribution.blindLock.calls.map(call => `<li><b>${escapeHtml(call.judgment)} / ${escapeHtml(call.confidence)}</b> — ${escapeHtml(call.reason)}</li>`).join('')}</ul></article>`).join('')
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(theoryName)} — Three-voice report</title><style>body{font:16px/1.55 Georgia,serif;margin:0;color:#171713;background:#f7f4e9}main{width:min(900px,calc(100% - 40px));margin:50px auto}section{border-top:2px solid;padding:24px 0;margin-top:42px}h1{font-size:3rem}h2{font-size:1.8rem}article{border:1px solid #aaa;padding:15px;margin:10px 0}.notice{font-weight:bold}@media print{body{background:#fff}main{width:100%;margin:0}section,article{break-inside:avoid}@page{margin:18mm}}</style></head><body><main><h1>${escapeHtml(theoryName)}</h1><p class="notice">Three voices are kept separate. Dissent is evidence; no synthetic consensus is produced.</p><section><h2>1. Neutral bench record</h2><p>${escapeHtml(packet.blindingNotice)}</p><ul>${commitments}</ul></section><section><h2>2. Theory proponent response</h2><p>${escapeHtml(proponentResponse)}</p></section><section><h2>3. Independent reviewer interpretation</h2>${reviewers}</section><p>Packet digest: ${escapeHtml(packet.integrityDigest)}</p><p>Bundle digest: ${escapeHtml(bundle.integrityDigest)}</p></main></body></html>`
}
