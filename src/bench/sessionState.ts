import { applyReviewDecision, createReviewState, type ReviewState } from './adjudication'
import { reviewFieldKeys } from './artifact'
import type { AnalysisResponse } from './analysis'
import { checkpointPaperMatches, type BenchCheckpoint } from './checkpoint'
import type { PaperSession } from './pdf'
import type { AnalysisRequest, DemandKey, VerifiedCitation } from './schema'
import { appendReviewEvent, type EvaluationRunV2, type ReviewEventV2 } from './v2/artifact'
import { defaultChallengeDefinitions } from './v2/defaultRegistry'

export type ReviewProgressUpdate = Parameters<typeof applyReviewDecision>[1]

export interface BenchSessionState {
  paperSession: PaperSession | null
  analysisResponse: AnalysisResponse | null
  review: ReviewState | null
  verifiedCitations: VerifiedCitation[]
  pendingCheckpoint: BenchCheckpoint | null
  activeCheckpointId: string | null
  lastIntegrityDigest: string | null
  currentRunId: string | null
  lastCanonicalRun: EvaluationRunV2 | null
  reviewEvents: ReviewEventV2[]
}

export function createSessionState(
  overrides: Partial<BenchSessionState> = {}
): BenchSessionState {
  return {
    paperSession: null,
    analysisResponse: null,
    review: null,
    verifiedCitations: [],
    pendingCheckpoint: null,
    activeCheckpointId: null,
    lastIntegrityDigest: null,
    currentRunId: null,
    lastCanonicalRun: null,
    reviewEvents: [],
    ...overrides
  }
}

function fieldText(draft: AnalysisResponse['draft']['challenges'][number], field: DemandKey): string {
  return draft[field].text
}

export function matchingPendingCheckpoint(
  state: BenchSessionState,
  paper: AnalysisRequest['paper']
): BenchCheckpoint | null {
  return state.pendingCheckpoint && checkpointPaperMatches(paper, state.pendingCheckpoint)
    ? state.pendingCheckpoint
    : null
}

export function applyNewPaper(
  state: BenchSessionState,
  paperSession: PaperSession
): BenchSessionState {
  return {
    ...state,
    paperSession,
    analysisResponse: null,
    review: null,
    verifiedCitations: [],
    reviewEvents: [],
    currentRunId: null,
    lastCanonicalRun: null
  }
}

export function applyAnalysisResult(
  state: BenchSessionState,
  input: {
    analysisResponse: AnalysisResponse
    verifiedCitations: VerifiedCitation[]
    reviewer: string
    currentRunId: string
    startedAt?: string
  }
): BenchSessionState {
  return {
    ...state,
    analysisResponse: input.analysisResponse,
    verifiedCitations: input.verifiedCitations,
    review: createReviewState(input.analysisResponse.draft, input.reviewer, input.startedAt),
    currentRunId: input.currentRunId
  }
}

export function applyReviewProgress(
  state: BenchSessionState,
  update: ReviewProgressUpdate,
  recordedAt = new Date().toISOString()
): BenchSessionState {
  if (!state.review || !state.analysisResponse || !state.currentRunId) return state
  const review = applyReviewDecision(state.review, update)
  const challenge = state.analysisResponse.draft.challenges.find(
    candidate => candidate.challengeId === update.challengeId
  )!
  const modelValue = update.field === 'verdict'
    ? challenge.proposedVerdict
    : fieldText(challenge, update.field)
  const claimId = update.field === 'verdict'
    ? `verdict:${state.currentRunId}:${update.challengeId}`
    : `claim:${state.currentRunId}:${update.challengeId}:${update.field}`
  return {
    ...state,
    review,
    reviewEvents: appendReviewEvent(state.reviewEvents, {
      eventId: `event:${state.currentRunId}:${state.reviewEvents.length + 1}`,
      sequence: state.reviewEvents.length + 1,
      recordedAt,
      reviewerAlias: review.reviewer,
      claimId,
      decision: update.decision,
      modelValue,
      ...(update.adjudicatedValue ? { humanValue: update.adjudicatedValue.trim() } : {}),
      ...(update.reason ? { reason: update.reason.trim() } : {})
    })
  }
}

export function applyCheckpointArmed(
  state: BenchSessionState,
  checkpoint: BenchCheckpoint | null
): BenchSessionState {
  return { ...state, pendingCheckpoint: checkpoint }
}

export function applyCheckpointResume(
  state: BenchSessionState,
  checkpoint: BenchCheckpoint,
  createRunId: () => string
): BenchSessionState {
  if (!state.paperSession) return state
  return {
    ...state,
    paperSession: {
      ...state.paperSession,
      paper: {
        ...state.paperSession.paper,
        title: checkpoint.paper.title,
        authors: checkpoint.paper.authors,
        year: checkpoint.paper.year,
        doi: checkpoint.paper.doi,
        sourceUrl: checkpoint.paper.sourceUrl
      }
    },
    analysisResponse: checkpoint.analysis,
    verifiedCitations: checkpoint.verifiedCitations,
    review: checkpoint.humanReview,
    reviewEvents: checkpoint.reviewEvents ?? [],
    activeCheckpointId: checkpoint.checkpointId,
    currentRunId: checkpoint.runId ?? createRunId(),
    pendingCheckpoint: null
  }
}

export function applyCanonicalRun(
  state: BenchSessionState,
  run: EvaluationRunV2
): BenchSessionState {
  return {
    ...state,
    lastCanonicalRun: run,
    lastIntegrityDigest: run.integrityDigest
  }
}

export function applyLocalCheckpointSaved(
  state: BenchSessionState,
  checkpointId: string
): BenchSessionState {
  return { ...state, activeCheckpointId: checkpointId }
}

export function applyLocalCheckpointDeleted(
  state: BenchSessionState,
  checkpointId: string
): BenchSessionState {
  return {
    ...state,
    activeCheckpointId: state.activeCheckpointId === checkpointId ? null : state.activeCheckpointId,
    pendingCheckpoint: null
  }
}

export function applyAllLocalCheckpointsDeleted(state: BenchSessionState): BenchSessionState {
  return {
    ...state,
    activeCheckpointId: null,
    pendingCheckpoint: null
  }
}

export function resolvedReviewCount(state: BenchSessionState): number {
  if (!state.review) return 0
  return Object.values(state.review.challenges).reduce((total, challenge) =>
    total + Object.values(challenge.fields).filter(field => field.decision !== 'pending').length +
    (challenge.verdict.decision === 'pending' ? 0 : 1), 0)
}

export function totalReviewCalls(state: BenchSessionState): number {
  return (state.analysisResponse?.draft.challenges.length ?? defaultChallengeDefinitions.length) *
    (reviewFieldKeys().length + 1)
}
