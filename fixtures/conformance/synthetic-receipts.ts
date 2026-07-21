import { createReviewState } from '../../src/bench/adjudication'
import {
  createEvaluationRun,
  stableStringify,
  type EvaluationRun
} from '../../src/bench/artifact'
import { sha256Text } from '../../src/bench/hash'
import type { AiDraft, BenchmarkDefinition, ChallengeId, DemandKey } from '../../src/bench/schema'
import {
  evaluationRunV2Schema,
  type EvaluationRunV2
} from '../../src/bench/v2/artifact'
import {
  defaultBenchmarkV2,
  defaultChallengeDefinitions
} from '../../src/bench/v2/defaultRegistry'

const demandKeys: DemandKey[] = [
  'explanation',
  'mechanism',
  'novelPrediction',
  'falsifier',
  'measurableWitness'
]

const challengeIds: ChallengeId[] = ['provenance-flip', 'synesthesia', 'blindsight']
const createdAt = '2030-01-02T03:04:05.000Z'
const sourceQuote = 'Synthetic fragment: signal S precedes report R under intervention I.'

function citationId(challengeId: ChallengeId, demand: DemandKey): string {
  return `citation:${challengeId}:${demand}`
}

function supportedText(challengeId: ChallengeId, demand: DemandKey) {
  return {
    text: `SEALED MODEL ${challengeId} ${demand}: synthetic fixture claim.`,
    citations: [{
      id: citationId(challengeId, demand),
      pdfPage: 1,
      quote: sourceQuote,
      locationHint: 'Synthetic fixture page',
      supportsField: `challenges.${challengeId}.${demand}`
    }]
  }
}

function challengeDraft(challengeId: ChallengeId) {
  return {
    challengeId,
    explanation: supportedText(challengeId, 'explanation'),
    mechanism: {
      ...supportedText(challengeId, 'mechanism'),
      steps: ['Synthetic state A', 'Synthetic state B']
    },
    novelPrediction: {
      ...supportedText(challengeId, 'novelPrediction'),
      intervention: 'Apply synthetic intervention I',
      independentVariable: 'Intervention state',
      dependentMeasure: 'Synthetic response latency',
      populationOrSystem: 'Simulated fixture system',
      directionalOutcome: 'Latency decreases under intervention I'
    },
    falsifier: {
      ...supportedText(challengeId, 'falsifier'),
      incompatibleObservation: 'Signal S follows report R in every fixture trial',
      rationale: 'That ordering contradicts the sealed synthetic mechanism.'
    },
    measurableWitness: {
      ...supportedText(challengeId, 'measurableWitness'),
      observable: 'Synthetic signal S',
      method: 'Deterministic fixture probe',
      contrast: 'Intervention I present versus absent',
      expectedSignature: 'Signal S occurs before report R'
    },
    evasionFlags: [],
    proposedVerdict: 'strained' as const,
    verdictRationale: `SEALED VERDICT ${challengeId}: fixture-only rationale.`,
    extractionConfidence: 'high' as const
  }
}

function aiDraft(): AiDraft {
  return {
    theory: {
      name: 'Synthetic Relay Theory',
      summary: 'A fixture-only theory used to test receipt conformance.',
      centralClaims: [{
        text: 'SEALED CENTRAL CLAIM: synthetic relay state S precedes report R.',
        citations: []
      }]
    },
    challenges: challengeIds.map(challengeDraft)
  }
}

function analysis() {
  return {
    mode: 'mock' as const,
    provider: 'local-fixture',
    model: 'synthetic-conformance-model',
    reasoningEffort: 'fixture',
    promptVersion: 'fixture-prompt/v1',
    promptDigest: 'c'.repeat(64),
    responseId: 'fixture-response-001',
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    store: false as const
  }
}

function paper() {
  return {
    fileName: 'synthetic-relay-paper.pdf',
    byteSize: 512,
    sha256: 'a'.repeat(64),
    textSha256: 'b'.repeat(64),
    pageCount: 1,
    characterCount: sourceQuote.length,
    title: 'Synthetic Relay Paper',
    year: 2030
  }
}

function legacyBenchmark(): BenchmarkDefinition {
  return {
    schemaVersion: 'mac-benchmark-definition/v1',
    id: 'mac-lab-001',
    version: '0.1.0-alpha.1',
    status: 'provisional',
    title: 'Synthetic Legacy Benchmark Fixture',
    description: 'Fixture-only benchmark input for deterministic v1 normalization.',
    authors: [{ name: 'Synthetic Fixture Laboratory', role: 'fixture steward' }],
    sourceUrls: ['https://example.invalid/synthetic-benchmark'],
    createdAt,
    demands: demandKeys,
    challenges: challengeIds.map(challengeId => ({
      id: challengeId,
      name: `Synthetic ${challengeId}`,
      shortName: challengeId,
      phenomenon: `Synthetic phenomenon for ${challengeId}.`,
      adversarialPrompt: `Explain the synthetic ${challengeId} fixture.`,
      rationale: `Fixture-only rationale for ${challengeId}.`,
      empiricalAnchors: [{
        label: 'Synthetic empirical anchor',
        url: `https://example.invalid/anchors/${challengeId}`
      }],
      demands: demandKeys
    }))
  }
}

export async function createSyntheticV1Receipt(): Promise<EvaluationRun> {
  const draft = aiDraft()
  const review = createReviewState(draft, 'reviewer-fixture-legacy', createdAt)
  review.completedAt = createdAt
  for (const challenge of Object.values(review.challenges)) {
    for (const field of Object.values(challenge.fields)) field.decision = 'accepted'
    challenge.verdict.decision = 'accepted'
  }

  const verifiedCitations = challengeIds.flatMap(challengeId =>
    demandKeys.map(demand => ({
      id: citationId(challengeId, demand),
      pdfPage: 1,
      quote: sourceQuote,
      locationHint: 'Synthetic fixture page',
      supportsField: `challenges.${challengeId}.${demand}`,
      verification: 'exact' as const,
      verifiedAt: createdAt
    }))
  )

  return createEvaluationRun({
    runId: '10000000-0000-4000-8000-000000000001',
    createdAt,
    sourceCommit: 'synthetic-v1-fixture',
    paper: paper(),
    benchmark: legacyBenchmark(),
    draft,
    verifiedCitations,
    review,
    analysis: analysis()
  })
}

export async function createSyntheticV2Receipt(): Promise<EvaluationRunV2> {
  const draft = aiDraft()
  const runId = '20000000-0000-4000-8000-000000000002'
  let sequence = 0
  const reviewEvents = challengeIds.flatMap(challengeId => {
    const claimEvents = demandKeys.map(demand => {
      sequence += 1
      return {
        eventId: `event:${sequence.toString().padStart(2, '0')}`,
        sequence,
        recordedAt: createdAt,
        reviewerAlias: 'reviewer-fixture-v2',
        claimId: `claim:${runId}:${challengeId}:${demand}`,
        decision: 'accepted' as const,
        modelValue: supportedText(challengeId, demand).text
      }
    })
    sequence += 1
    return [...claimEvents, {
      eventId: `event:${sequence.toString().padStart(2, '0')}`,
      sequence,
      recordedAt: createdAt,
      reviewerAlias: 'reviewer-fixture-v2',
      claimId: `verdict:${runId}:${challengeId}`,
      decision: 'accepted' as const,
      modelValue: 'strained',
      reason: `SEALED STRESS ${challengeId}: fixture-only call.`
    }]
  })
  const verifiedCitations = challengeIds.flatMap(challengeId =>
    demandKeys.map(demand => ({
      id: citationId(challengeId, demand),
      pdfPage: 1,
      quote: sourceQuote,
      locationHint: 'Synthetic fixture page',
      supportsField: `challenges.${challengeId}.${demand}`,
      verification: 'exact' as const,
      verifiedAt: createdAt
    }))
  )
  const claimLedger = challengeIds.flatMap(challengeId =>
    demandKeys.map(demand => {
      const event = reviewEvents.find(candidate =>
        candidate.claimId === `claim:${runId}:${challengeId}:${demand}`
      )!
      return {
        claimId: event.claimId,
        sourceQuotes: [{
          citationId: citationId(challengeId, demand),
          quote: sourceQuote,
          pdfPage: 1,
          verification: 'exact' as const
        }],
        challenge: { id: challengeId, version: '1.0.0' },
        demand,
        modelDraft: event.modelValue,
        humanEventIds: [event.eventId],
        finalCall: {
          decision: 'accepted' as const,
          value: event.modelValue,
          eventId: event.eventId
        }
      }
    })
  )
  const stressFractureMap = challengeIds.map(challengeId => ({
    challengeId,
    modelVerdict: 'strained' as const,
    humanVerdict: 'strained' as const,
    humanDecision: 'accepted' as const,
    rationale: `SEALED STRESS ${challengeId}: fixture-only call.`
  }))
  const witnessProtocols = challengeIds.map(challengeId => ({
    challengeId,
    prediction: supportedText(challengeId, 'novelPrediction').text,
    intervention: 'Apply synthetic intervention I',
    observable: 'Synthetic signal S',
    method: 'Deterministic fixture probe',
    contrast: 'Intervention I present versus absent',
    expectedSignature: 'Signal S occurs before report R',
    extractionConfidence: 'high' as const
  }))
  const unsigned = {
    schemaVersion: 'mac-evaluation-run/v2' as const,
    runId,
    artifactStatus: 'adjudicated' as const,
    appVersion: '0.2.0-beta.1',
    sourceCommit: 'synthetic-v2-fixture',
    createdAt,
    paper: paper(),
    benchmark: {
      definition: structuredClone(defaultBenchmarkV2),
      challenges: structuredClone(defaultChallengeDefinitions)
    },
    analysis: analysis(),
    aiDraft: draft,
    verifiedCitations,
    claimLedger,
    reviewEvents,
    stressFractureMap,
    witnessProtocols,
    summary: 'SEALED SUMMARY: deterministic synthetic receipt with categorical calls and no score.'
  }
  const integrityDigest = await sha256Text(stableStringify(unsigned))
  return evaluationRunV2Schema.parse({ ...unsigned, integrityDigest })
}
