import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { normalizeEvaluationRun } from '@/bench/v2/artifact'
import {
  createBlindReviewPacket,
  createProvenanceEnvelope,
  generateThreeVoiceReport,
  lockBlindContribution,
  mergeReviewContributions,
  revealContribution,
  validateBlindReviewPacket
} from '@/bench/collaboration'

const fixturePath = new URL('../fixtures/demo/witness-theory-adjudicated.json', import.meta.url)

describe('portable blind and independent review artifacts', () => {
  it('creates a partially blinded packet with digest-bound redacted evidence', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const packet = await createBlindReviewPacket(run, 'Theory Cedar')
    const serialized = JSON.stringify(packet)

    expect(packet.schemaVersion).toBe('blind-review-packet/v1')
    expect(packet.blinding).toBe('partial')
    expect(packet.commitments).toHaveLength(15)
    expect(serialized).not.toContain(run.paper.fileName)
    expect(serialized).not.toContain(run.aiDraft.theory.name)
    expect(serialized).not.toContain(run.analysis.model)
    expect(serialized).not.toContain(run.paper.sha256)
    expect(serialized).not.toContain(run.claimLedger[0].sourceQuotes[0]?.quote ?? 'impossible sentinel')
    await expect(validateBlindReviewPacket(packet)).resolves.toEqual(packet)
    await expect(validateBlindReviewPacket({ ...packet, alias: 'Tampered' })).rejects.toThrow(/digest/i)
  })

  it('locks first calls before provenance reveal and records the delta without a score', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const packet = await createBlindReviewPacket(run, 'Theory Cedar')
    const firstCall = {
      blindClaimId: packet.commitments[0].blindClaimId,
      judgment: 'strained' as const,
      confidence: 'medium' as const,
      responseTimeMs: 4200,
      reason: 'The mechanism is underspecified.'
    }
    const contribution = await lockBlindContribution(packet, 'Reviewer A', [firstCall], '2026-07-20T20:00:00.000Z')
    const envelope = await createProvenanceEnvelope(run, packet)
    const revealed = await revealContribution(contribution, envelope, [{
      ...firstCall,
      judgment: 'insufficient_evidence',
      confidence: 'high',
      responseTimeMs: 1800,
      reason: 'The verified source page narrows the commitment.'
    }], '2026-07-20T20:05:00.000Z')

    expect(contribution.blindLock.integrityDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(revealed.provenanceReveal?.deltas[0]).toMatchObject({ changed: true })
    expect(JSON.stringify(revealed)).not.toMatch(/score|average|rank/i)
  })

  it('merges independent contributions as dissent instead of consensus', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const packet = await createBlindReviewPacket(run, 'Theory Cedar')
    const claim = packet.commitments[0].blindClaimId
    const reviewerA = await lockBlindContribution(packet, 'Reviewer A', [{
      blindClaimId: claim,
      judgment: 'supported',
      confidence: 'low',
      responseTimeMs: 1000,
      reason: 'The commitment is explicit.'
    }])
    const reviewerB = await lockBlindContribution(packet, 'Reviewer B', [{
      blindClaimId: claim,
      judgment: 'unsupported',
      confidence: 'high',
      responseTimeMs: 2200,
      reason: 'The source does not entail it.'
    }])
    const bundle = await mergeReviewContributions(packet, [reviewerA, reviewerB])

    expect(bundle.schemaVersion).toBe('review-bundle/v1')
    expect(bundle.disagreements[0].calls.map(call => call.judgment)).toEqual(['supported', 'unsupported'])
    expect(bundle).not.toHaveProperty('score')
    expect(bundle).not.toHaveProperty('consensus')
    const report = generateThreeVoiceReport(packet, bundle, 'The proponent disputes the mechanism reading.')
    expect(report).toContain('1. Neutral bench record')
    expect(report).toContain('2. Theory proponent response')
    expect(report).toContain('3. Independent reviewer interpretation')
    expect(report).toContain('Reviewer A')
    expect(report).toContain('Reviewer B')
    expect(report).not.toMatch(/<script/i)
  })
})
