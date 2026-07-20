import { describe, expect, it } from 'vitest'
import { createReviewState, applyReviewDecision } from '@/bench/adjudication'
import { benchmarkDefinition } from '@/bench/benchmark'
import {
  createEvaluationRun,
  evaluationRunSchema,
  stableStringify,
  validateEvaluationRunArtifact
} from '@/bench/artifact'
import { sha256Text } from '@/bench/hash'
import type { AiDraft, DemandKey } from '@/bench/schema'

const demandKeys: DemandKey[] = [
  'explanation',
  'mechanism',
  'novelPrediction',
  'falsifier',
  'measurableWitness'
]

function draftFixture(): AiDraft {
  return {
    theory: {
      name: 'Witness Theory',
      summary: 'A test theory.',
      centralClaims: []
    },
    challenges: benchmarkDefinition.challenges.map(challenge => ({
      challengeId: challenge.id,
      explanation: { text: 'Explains the phenomenon.', citations: [] },
      mechanism: { text: 'Specifies a mechanism.', steps: ['A', 'B'], citations: [] },
      novelPrediction: {
        text: `Prediction for ${challenge.shortName}`,
        intervention: 'Manipulate the proposed cause',
        independentVariable: 'causal strength',
        dependentMeasure: 'witness amplitude',
        populationOrSystem: 'adult participants',
        directionalOutcome: 'greater amplitude',
        citations: []
      },
      falsifier: {
        text: 'A null result would weaken the account.',
        incompatibleObservation: 'No difference under intervention',
        rationale: 'The mechanism requires a difference.',
        citations: []
      },
      measurableWitness: {
        text: 'A time-local signal.',
        observable: 'witness amplitude',
        method: 'EEG',
        contrast: 'test versus control',
        expectedSignature: 'divergence within 300 ms',
        citations: []
      },
      evasionFlags: [],
      proposedVerdict: 'survives',
      verdictRationale: 'All demands are addressed.',
      extractionConfidence: 'medium'
    }))
  }
}

describe('evaluation artifact', () => {
  it('uses stable key ordering for integrity hashes', () => {
    expect(stableStringify({ beta: 2, alpha: { delta: 4, gamma: 3 } })).toBe(
      '{"alpha":{"delta":4,"gamma":3},"beta":2}'
    )
  })

  it('computes a deterministic SHA-256 digest', async () => {
    expect(await sha256Text('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })

  it('exports a complete adjudicated run and accepted experiment queue', async () => {
    const draft = draftFixture()
    let review = createReviewState(draft, 'Kris')

    for (const challenge of benchmarkDefinition.challenges) {
      for (const field of demandKeys) {
        review = applyReviewDecision(review, {
          challengeId: challenge.id,
          field,
          decision: 'accepted'
        })
      }
      review = applyReviewDecision(review, {
        challengeId: challenge.id,
        field: 'verdict',
        decision: 'accepted'
      })
    }

    const run = await createEvaluationRun({
      runId: '00000000-0000-4000-8000-000000000001',
      createdAt: '2026-07-20T20:00:00.000Z',
      sourceCommit: '5c2b541',
      paper: {
        fileName: 'witness-theory.pdf',
        byteSize: 1200,
        sha256: 'a'.repeat(64),
        textSha256: 'b'.repeat(64),
        pageCount: 2,
        characterCount: 900,
        title: 'Witness Theory'
      },
      benchmark: benchmarkDefinition,
      draft,
      verifiedCitations: [],
      review,
      analysis: {
        mode: 'mock',
        provider: 'local',
        model: 'deterministic-fixture',
        reasoningEffort: 'none',
        promptVersion: 'mac-interrogator/1',
        promptDigest: 'c'.repeat(64),
        responseId: 'mock-001',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 4,
        store: false
      }
    })

    expect(run.artifactStatus).toBe('adjudicated')
    expect(run.experimentQueue).toHaveLength(3)
    expect(run.summary).not.toMatch(/\d+% conscious/i)
    expect(run.artifactSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(evaluationRunSchema.parse(run)).toEqual(run)
    await expect(validateEvaluationRunArtifact(run)).resolves.toEqual(run)
    await expect(validateEvaluationRunArtifact({ ...run, summary: 'Tampered after export.' }))
      .rejects.toThrow('digest does not match')
  })

  it('refuses to seal an accepted field with a citation that was not found', async () => {
    const draft = draftFixture()
    draft.challenges[0].explanation.citations = [{
      id: 'missing-citation',
      pdfPage: 1,
      quote: 'Words that are not on the cited page.',
      supportsField: 'challenges.provenance-flip.explanation'
    }]
    let review = createReviewState(draft, 'Kris')
    for (const challenge of benchmarkDefinition.challenges) {
      for (const field of demandKeys) {
        review = applyReviewDecision(review, { challengeId: challenge.id, field, decision: 'accepted' })
      }
      review = applyReviewDecision(review, { challengeId: challenge.id, field: 'verdict', decision: 'accepted' })
    }

    const run = await createEvaluationRun({
      runId: '00000000-0000-4000-8000-000000000002',
      createdAt: '2026-07-20T20:00:00.000Z',
      sourceCommit: '5c2b541',
      paper: {
        fileName: 'witness-theory.pdf',
        byteSize: 1200,
        sha256: 'a'.repeat(64),
        textSha256: 'b'.repeat(64),
        pageCount: 2,
        characterCount: 900
      },
      benchmark: benchmarkDefinition,
      draft,
      verifiedCitations: [{
        id: 'missing-citation',
        pdfPage: 1,
        quote: 'Words that are not on the cited page.',
        supportsField: 'challenges.provenance-flip.explanation',
        verification: 'not_found',
        verifiedAt: '2026-07-20T20:00:00.000Z'
      }],
      review,
      analysis: {
        mode: 'mock',
        provider: 'local',
        model: 'deterministic-fixture',
        reasoningEffort: 'none',
        promptVersion: 'mac-interrogator/1',
        promptDigest: 'c'.repeat(64),
        responseId: 'mock-002',
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 4,
        store: false
      }
    })

    expect(run.artifactStatus).toBe('unadjudicated')
  })
})
