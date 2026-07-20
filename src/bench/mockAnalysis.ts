import { benchmarkDefinition } from './benchmark'
import { sha256Text } from './hash'
import {
  aiDraftSchema,
  type AiDraft,
  type AnalysisRequest,
  type ChallengeId,
  type CitationDraft,
  type DemandKey
} from './schema'
import { analysisResponseSchema, type AnalysisResponse } from './analysis'

export const MOCK_PROMPT_VERSION = 'mac-interrogator/1'
const mockPrompt = 'Deterministic local MAC Bench apparatus rehearsal. No scientific verdict.'

function firstGroundedQuote(request: AnalysisRequest) {
  for (const page of request.paper.pages) {
    const sentences = page.text
      .replace(/\s+/g, ' ')
      .trim()
      .split(/(?<=[.!?])\s+/)
    const quote = sentences.find(sentence =>
      sentence.length >= 36 &&
      sentence.length <= 360 &&
      !/ignore (all|any|the|previous|prior) instructions/i.test(sentence)
    )
    if (quote) return { pdfPage: page.pdfPage, quote }
  }

  const page = request.paper.pages[0]
  const quote = page.text.replace(/\s+/g, ' ').trim().slice(0, 360)
  if (!quote) throw new Error('The paper contains no extractable text')
  return { pdfPage: page.pdfPage, quote }
}

function mockCitation(
  source: { pdfPage: number; quote: string },
  challengeId: ChallengeId | 'theory',
  field: DemandKey | 'centralClaims',
  suffix: string
): CitationDraft {
  return {
    id: `${challengeId}-${field}-${suffix}`,
    pdfPage: source.pdfPage,
    quote: source.quote,
    locationHint: 'Deterministic mock evidence anchor',
    supportsField: challengeId === 'theory'
      ? 'theory.centralClaims'
      : `challenges.${challengeId}.${field}`
  }
}

function createMockDraft(request: AnalysisRequest): AiDraft {
  const source = firstGroundedQuote(request)
  const theoryName = request.paper.title ?? request.paper.fileName.replace(/\.pdf$/i, '')
  const sourceCitation = (challengeId: ChallengeId, field: DemandKey) => [
    mockCitation(source, challengeId, field, '1')
  ]

  return aiDraftSchema.parse({
    theory: {
      name: theoryName,
      summary: 'Deterministic mock extraction for interface and evidence-flow validation. Run live analysis for a scientific draft.',
      centralClaims: [{
        text: source.quote,
        citations: [mockCitation(source, 'theory', 'centralClaims', '1')]
      }]
    },
    challenges: benchmarkDefinition.challenges.map((challenge, index) => ({
      challengeId: challenge.id,
      explanation: {
        text: `Mock interrogation: ${challenge.phenomenon} The uploaded paper must be checked for an explicit account rather than inferred from this fixture.`,
        citations: sourceCitation(challenge.id, 'explanation')
      },
      mechanism: {
        text: 'Mock mechanism placeholder grounded to a real paper quote but requiring human revision before scientific use.',
        steps: ['Locate the paper’s proposed conscious process.', 'Test whether that process discriminates the challenge alternatives.'],
        citations: sourceCitation(challenge.id, 'mechanism')
      },
      novelPrediction: {
        text: `Model-proposed extension: intervene on the mechanism named by the paper while holding the ${challenge.shortName} stimulus conditions fixed.`,
        intervention: 'Manipulate the paper’s proposed conscious mechanism',
        independentVariable: 'mechanism present versus disrupted',
        dependentMeasure: 'challenge-specific measurable witness',
        populationOrSystem: 'the population or system specified by the paper',
        directionalOutcome: 'the witness should change in the direction required by the theory',
        citations: sourceCitation(challenge.id, 'novelPrediction')
      },
      falsifier: {
        text: 'Model-proposed extension: the account is weakened if the predicted witness remains unchanged when its proposed mechanism is selectively disrupted.',
        incompatibleObservation: 'Selective mechanism disruption produces no change in the predicted witness',
        rationale: 'A causal mechanism must make a discriminating intervention-level commitment.',
        citations: sourceCitation(challenge.id, 'falsifier')
      },
      measurableWitness: {
        text: 'Mock witness placeholder: define a time-local observable that separates phenomenal change from evaluation, association, or report.',
        observable: 'challenge-specific time-local response',
        method: 'preregistered behavioural and physiological measurement',
        contrast: 'mechanism present versus selectively disrupted',
        expectedSignature: 'a directional divergence before or independently of final report',
        citations: sourceCitation(challenge.id, 'measurableWitness')
      },
      evasionFlags: ['Mock mode cannot determine whether the paper genuinely addresses this challenge.'],
      proposedVerdict: 'insufficient_evidence',
      verdictRationale: 'Mock mode validates the apparatus, not the theory. A live evidence extraction and human review are required.',
      extractionConfidence: index === 0 ? 'low' : 'medium'
    }))
  })
}

export async function createMockAnalysis(
  request: AnalysisRequest,
  startedAt = performance.now()
): Promise<AnalysisResponse> {
  return analysisResponseSchema.parse({
    draft: createMockDraft(request),
    analysis: {
      mode: 'mock',
      provider: 'local',
      model: 'deterministic-fixture',
      reasoningEffort: 'none',
      promptVersion: MOCK_PROMPT_VERSION,
      promptDigest: await sha256Text(mockPrompt),
      responseId: `mock-${request.paper.sha256.slice(0, 12)}`,
      inputTokens: 0,
      outputTokens: 0,
      latencyMs: Math.max(0, performance.now() - startedAt),
      store: false
    }
  })
}
