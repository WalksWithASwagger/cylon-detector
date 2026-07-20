import { describe, expect, it } from 'vitest'
import { benchmarkDefinition } from '@/bench/benchmark'
import {
  applyReviewDecision,
  buildNarrative,
  canExportAdjudicated,
  createReviewState
} from '@/bench/adjudication'
import type { AiDraft } from '@/bench/schema'

const draft: AiDraft = {
  theory: {
    name: 'Integrated Information Theory 3.0',
    summary: 'Consciousness corresponds to irreducible cause-effect structure.',
    centralClaims: []
  },
  challenges: benchmarkDefinition.challenges.map((challenge, index) => ({
    challengeId: challenge.id,
    explanation: { text: `Explanation ${index}`, citations: [] },
    mechanism: { text: `Mechanism ${index}`, steps: ['Step one'], citations: [] },
    novelPrediction: {
      text: `Prediction ${index}`,
      intervention: 'Change the integration constraint',
      independentVariable: 'integration',
      dependentMeasure: 'report-independent neural response',
      populationOrSystem: 'healthy adults',
      directionalOutcome: 'stronger response',
      citations: []
    },
    falsifier: {
      text: `Falsifier ${index}`,
      incompatibleObservation: 'No response difference',
      rationale: 'The proposed mechanism predicts a difference.',
      citations: []
    },
    measurableWitness: {
      text: `Witness ${index}`,
      observable: 'time-local neural signature',
      method: 'EEG',
      contrast: 'aware versus unaware',
      expectedSignature: 'early divergence',
      citations: []
    },
    evasionFlags: [],
    proposedVerdict: index === 0 ? 'evades' : index === 1 ? 'survives' : 'strained',
    verdictRationale: 'Draft rationale',
    extractionConfidence: 'medium'
  }))
}

describe('human adjudication', () => {
  it('blocks adjudicated export while any required field is pending', () => {
    const review = createReviewState(draft)

    expect(canExportAdjudicated(review)).toBe(false)
  })

  it('preserves the AI value when a human revises a field', () => {
    const review = createReviewState(draft)
    const updated = applyReviewDecision(review, {
      challengeId: 'provenance-flip',
      field: 'mechanism',
      decision: 'revised',
      adjudicatedValue: 'Top-down provenance information changes recurrent valuation dynamics.',
      reason: 'The draft mechanism was underspecified.'
    })

    expect(updated.challenges['provenance-flip'].fields.mechanism.aiValue).toBe('Mechanism 0')
    expect(updated.challenges['provenance-flip'].fields.mechanism.adjudicatedValue).toContain('Top-down')
  })

  it('builds a categorical narrative without a consciousness score', () => {
    const narrative = buildNarrative({
      benchmarkVersion: '0.1.0-alpha.1',
      theoryName: 'Integrated Information Theory 3.0',
      verdicts: {
        'provenance-flip': 'evades',
        synesthesia: 'survives',
        blindsight: 'strained'
      },
      experimentCount: 2
    })

    expect(narrative).toBe(
      'MAC Bench 0.1.0-alpha.1 put Integrated Information Theory 3.0 through three adversarial filters. The human review found that it survived Synesthesia, was strained by Blindsight, and evaded the Provenance Flip. That leaves 2 testable experiments worth running.'
    )
    expect(narrative).not.toMatch(/\d+% conscious/i)
  })
})
