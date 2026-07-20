import type { AiDraft, ChallengeId, DemandKey, Verdict } from './schema'

export type ReviewDecision = 'pending' | 'accepted' | 'revised' | 'rejected'

export interface FieldReview {
  decision: ReviewDecision
  aiValue: string
  adjudicatedValue?: string
  reason?: string
}

export interface ChallengeReview {
  fields: Record<DemandKey, FieldReview>
  verdict: FieldReview
}

export interface ReviewState {
  reviewer: string
  startedAt: string
  completedAt?: string
  challenges: Record<ChallengeId, ChallengeReview>
}

interface ReviewUpdate {
  challengeId: ChallengeId
  field: DemandKey | 'verdict'
  decision: Exclude<ReviewDecision, 'pending'>
  adjudicatedValue?: string
  reason?: string
}

const demandKeys: DemandKey[] = [
  'explanation',
  'mechanism',
  'novelPrediction',
  'falsifier',
  'measurableWitness'
]

function challengeValues(draft: AiDraft['challenges'][number]): Record<DemandKey, string> {
  return {
    explanation: draft.explanation.text,
    mechanism: draft.mechanism.text,
    novelPrediction: draft.novelPrediction.text,
    falsifier: draft.falsifier.text,
    measurableWitness: draft.measurableWitness.text
  }
}

export function createReviewState(
  draft: AiDraft,
  reviewer = 'Human reviewer',
  startedAt = new Date().toISOString()
): ReviewState {
  const challenges = {} as Record<ChallengeId, ChallengeReview>
  for (const challenge of draft.challenges) {
    const values = challengeValues(challenge)
    challenges[challenge.challengeId] = {
      fields: Object.fromEntries(demandKeys.map(field => [field, {
        decision: 'pending',
        aiValue: values[field]
      }])) as Record<DemandKey, FieldReview>,
      verdict: {
        decision: 'pending',
        aiValue: challenge.proposedVerdict
      }
    }
  }
  return { reviewer, startedAt, challenges }
}

export function applyReviewDecision(review: ReviewState, update: ReviewUpdate): ReviewState {
  if (update.decision === 'revised' && !update.adjudicatedValue?.trim()) {
    throw new Error('A revised field requires an adjudicated value')
  }
  if ((update.decision === 'revised' || update.decision === 'rejected') && !update.reason?.trim()) {
    throw new Error('A revision or rejection requires a reason')
  }

  const next = structuredClone(review)
  const target = update.field === 'verdict'
    ? next.challenges[update.challengeId].verdict
    : next.challenges[update.challengeId].fields[update.field]

  target.decision = update.decision
  target.adjudicatedValue = update.adjudicatedValue?.trim()
  target.reason = update.reason?.trim()
  delete next.completedAt
  return next
}

export function canExportAdjudicated(review: ReviewState): boolean {
  return Object.values(review.challenges).every(challenge =>
    challenge.verdict.decision !== 'pending' &&
    Object.values(challenge.fields).every(field => field.decision !== 'pending')
  )
}

export function completeReview(review: ReviewState, completedAt = new Date().toISOString()): ReviewState {
  if (!canExportAdjudicated(review)) {
    throw new Error('Every field and verdict must be adjudicated before completion')
  }
  return { ...structuredClone(review), completedAt }
}

const challengeLabels: Record<ChallengeId, string> = {
  'provenance-flip': 'the Provenance Flip',
  synesthesia: 'Synesthesia',
  blindsight: 'Blindsight'
}

function humanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items.at(-1)}`
}

interface NarrativeInput {
  benchmarkVersion: string
  theoryName: string
  verdicts: Record<ChallengeId, Verdict>
  experimentCount: number
}

export function buildNarrative(input: NarrativeInput): string {
  const phrases: string[] = []
  const categories: Array<[Verdict, string]> = [
    ['survives', 'survived'],
    ['strained', 'was strained by'],
    ['evades', 'evaded'],
    ['breaks', 'broke on'],
    ['insufficient_evidence', 'had insufficient evidence for']
  ]

  for (const [verdict, verb] of categories) {
    const challenges = (Object.entries(input.verdicts) as Array<[ChallengeId, Verdict]>)
      .filter(([, candidate]) => candidate === verdict)
      .map(([challengeId]) => challengeLabels[challengeId])
    if (challenges.length > 0) phrases.push(`${verb} ${humanList(challenges)}`)
  }

  const experimentLabel = input.experimentCount === 1 ? 'experiment' : 'experiments'
  return `MAC Bench ${input.benchmarkVersion} put ${input.theoryName} through three adversarial filters. The human review found that it ${humanList(phrases)}. That leaves ${input.experimentCount} testable ${experimentLabel} worth running.`
}
