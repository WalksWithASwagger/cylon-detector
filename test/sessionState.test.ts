import { describe, expect, it } from 'vitest'
import { createReviewState } from '@/bench/adjudication'
import { createCheckpoint } from '@/bench/checkpoint'
import { createMockAnalysis } from '@/bench/mockAnalysis'
import type { PaperSession } from '@/bench/pdf'
import type { AnalysisRequest } from '@/bench/schema'
import {
  applyAllLocalCheckpointsDeleted,
  applyAnalysisResult,
  applyCanonicalRun,
  applyCheckpointArmed,
  applyCheckpointResume,
  applyLocalCheckpointDeleted,
  applyLocalCheckpointSaved,
  applyNewPaper,
  applyReviewProgress,
  createSessionState,
  matchingPendingCheckpoint,
  resolvedReviewCount,
  totalReviewCalls
} from '@/bench/sessionState'
import type { EvaluationRunV2 } from '@/bench/v2/artifact'

const pageText = 'Conscious experience depends on a recurrent witness process before deliberate report.'

function request(): AnalysisRequest {
  return {
    benchmarkVersion: '0.1.0-alpha.1',
    paper: {
      fileName: 'witness-theory.pdf',
      sha256: 'a'.repeat(64),
      textSha256: 'b'.repeat(64),
      byteSize: 2048,
      pageCount: 1,
      characterCount: pageText.length,
      title: 'Extracted Title',
      pages: [{ pdfPage: 1, text: pageText }]
    }
  }
}

function paperSession(paper = request().paper): PaperSession {
  return {
    file: {} as File,
    document: { cleanup: async () => undefined } as PaperSession['document'],
    paper
  }
}

function importedRun(digest = 'c'.repeat(64)): EvaluationRunV2 {
  return { runId: '6f1d2c3a-4b5e-6789-abcd-ef0123456789', integrityDigest: digest } as EvaluationRunV2
}

describe('MAC Bench session state', () => {
  it('starts empty and can be reconstructed without a browser document', () => {
    const state = createSessionState()

    expect(state.paperSession).toBeNull()
    expect(state.analysisResponse).toBeNull()
    expect(state.review).toBeNull()
    expect(state.verifiedCitations).toEqual([])
    expect(state.pendingCheckpoint).toBeNull()
    expect(state.activeCheckpointId).toBeNull()
    expect(state.lastIntegrityDigest).toBeNull()
    expect(state.currentRunId).toBeNull()
    expect(state.lastCanonicalRun).toBeNull()
    expect(state.reviewEvents).toEqual([])
    expect(resolvedReviewCount(state)).toBe(0)
    expect(totalReviewCalls(state)).toBe(18)
  })

  it('resets analysis, review, events, and the canonical run when a new paper arrives', async () => {
    const analysis = await createMockAnalysis(request())
    const prior = createSessionState({
      paperSession: paperSession(),
      analysisResponse: analysis,
      review: createReviewState(analysis.draft, 'Prior reviewer', '2026-07-20T20:00:00.000Z'),
      verifiedCitations: [{ id: 'stale' } as never],
      reviewEvents: [{ eventId: 'stale' } as never],
      currentRunId: '11111111-1111-4111-8111-111111111111',
      lastCanonicalRun: importedRun(),
      lastIntegrityDigest: 'c'.repeat(64),
      pendingCheckpoint: { checkpointId: 'keep-armed' } as never,
      activeCheckpointId: 'keep-active'
    })
    const nextPaper = paperSession({ ...request().paper, title: 'Replacement Paper' })
    const next = applyNewPaper(prior, nextPaper)

    expect(next.paperSession).toBe(nextPaper)
    expect(next.analysisResponse).toBeNull()
    expect(next.review).toBeNull()
    expect(next.verifiedCitations).toEqual([])
    expect(next.reviewEvents).toEqual([])
    expect(next.currentRunId).toBeNull()
    expect(next.lastCanonicalRun).toBeNull()
    expect(next.lastIntegrityDigest).toBe('c'.repeat(64))
    expect(next.pendingCheckpoint).toEqual({ checkpointId: 'keep-armed' })
    expect(next.activeCheckpointId).toBe('keep-active')
    expect(prior.analysisResponse).toBe(analysis)
  })

  it('records an analysis result as a fresh pending review', async () => {
    const analysis = await createMockAnalysis(request())
    const next = applyAnalysisResult(createSessionState({ paperSession: paperSession() }), {
      analysisResponse: analysis,
      verifiedCitations: [],
      reviewer: 'Kris Krüg',
      currentRunId: '22222222-2222-4222-8222-222222222222',
      startedAt: '2026-07-20T21:00:00.000Z'
    })

    expect(next.analysisResponse).toBe(analysis)
    expect(next.review?.reviewer).toBe('Kris Krüg')
    expect(next.review?.startedAt).toBe('2026-07-20T21:00:00.000Z')
    expect(next.currentRunId).toBe('22222222-2222-4222-8222-222222222222')
    expect(resolvedReviewCount(next)).toBe(0)
    expect(totalReviewCalls(next)).toBe(18)
    expect(next.reviewEvents).toEqual([])
  })

  it('appends review progress without mutating the previous session', async () => {
    const analysis = await createMockAnalysis(request())
    const analyzed = applyAnalysisResult(createSessionState({ paperSession: paperSession() }), {
      analysisResponse: analysis,
      verifiedCitations: [],
      reviewer: 'Kris Krüg',
      currentRunId: '33333333-3333-4333-8333-333333333333',
      startedAt: '2026-07-20T21:00:00.000Z'
    })
    const next = applyReviewProgress(analyzed, {
      challengeId: 'provenance-flip',
      field: 'mechanism',
      decision: 'revised',
      adjudicatedValue: 'The witness must precede report.',
      reason: 'The draft did not separate experience from evaluation.'
    }, '2026-07-20T21:05:00.000Z')

    expect(resolvedReviewCount(analyzed)).toBe(0)
    expect(resolvedReviewCount(next)).toBe(1)
    expect(next.review?.challenges['provenance-flip'].fields.mechanism.decision).toBe('revised')
    expect(next.reviewEvents).toEqual([{
      eventId: 'event:33333333-3333-4333-8333-333333333333:1',
      sequence: 1,
      recordedAt: '2026-07-20T21:05:00.000Z',
      reviewerAlias: 'Kris Krüg',
      claimId: 'claim:33333333-3333-4333-8333-333333333333:provenance-flip:mechanism',
      decision: 'revised',
      modelValue: analysis.draft.challenges[0].mechanism.text,
      humanValue: 'The witness must precede report.',
      reason: 'The draft did not separate experience from evaluation.'
    }])
  })

  it('leaves review progress unchanged when the session is not ready', () => {
    const state = createSessionState()
    const next = applyReviewProgress(state, {
      challengeId: 'provenance-flip',
      field: 'explanation',
      decision: 'accepted'
    })

    expect(next).toBe(state)
    expect(next.reviewEvents).toEqual([])
  })

  it('resumes a matching checkpoint and overlays saved paper metadata', async () => {
    const input = request()
    const analysis = await createMockAnalysis(input)
    const review = createReviewState(analysis.draft, 'Kris Krüg', '2026-07-20T20:00:00.000Z')
    const checkpoint = await createCheckpoint({
      checkpointId: '404c91de-01e3-40c5-bd43-6a9cc15cad1b',
      runId: '55555555-5555-4555-8555-555555555555',
      savedAt: '2026-07-20T20:00:00.000Z',
      paper: { ...input.paper, title: 'Witness Theory', authors: ['Ada Witness'], year: 2026 },
      analysis,
      verifiedCitations: [],
      review
    })
    const armed = applyCheckpointArmed(createSessionState(), checkpoint)
    expect(matchingPendingCheckpoint(armed, input.paper)).toBe(checkpoint)
    expect(matchingPendingCheckpoint(armed, { ...input.paper, sha256: 'd'.repeat(64) })).toBeNull()

    const acquired = applyNewPaper(armed, paperSession(input.paper))
    const resumed = applyCheckpointResume(acquired, checkpoint, () => 'should-not-run')

    expect(resumed.paperSession?.paper.title).toBe('Witness Theory')
    expect(resumed.paperSession?.paper.authors).toEqual(['Ada Witness'])
    expect(resumed.paperSession?.paper.year).toBe(2026)
    expect(resumed.analysisResponse).toBe(analysis)
    expect(resumed.review).toBe(review)
    expect(resumed.reviewEvents).toEqual([])
    expect(resumed.activeCheckpointId).toBe(checkpoint.checkpointId)
    expect(resumed.currentRunId).toBe('55555555-5555-4555-8555-555555555555')
    expect(resumed.pendingCheckpoint).toBeNull()
  })

  it('assigns a new run id when a resumed checkpoint has none', async () => {
    const input = request()
    const analysis = await createMockAnalysis(input)
    const checkpoint = await createCheckpoint({
      checkpointId: '404c91de-01e3-40c5-bd43-6a9cc15cad1b',
      paper: input.paper,
      analysis,
      verifiedCitations: [],
      review: createReviewState(analysis.draft)
    })
    const resumed = applyCheckpointResume(
      applyNewPaper(applyCheckpointArmed(createSessionState(), checkpoint), paperSession(input.paper)),
      checkpoint,
      () => '66666666-6666-4666-8666-666666666666'
    )

    expect(checkpoint.runId).toBeUndefined()
    expect(resumed.currentRunId).toBe('66666666-6666-4666-8666-666666666666')
  })

  it('stores an imported canonical run as receipt state', () => {
    const run = importedRun('e'.repeat(64))
    const next = applyCanonicalRun(createSessionState({ lastIntegrityDigest: 'old' }), run)

    expect(next.lastCanonicalRun).toBe(run)
    expect(next.lastIntegrityDigest).toBe('e'.repeat(64))
  })

  it('clears checkpoint pointers on local deletion without dropping paper work', async () => {
    const analysis = await createMockAnalysis(request())
    const checkpoint = await createCheckpoint({
      checkpointId: '404c91de-01e3-40c5-bd43-6a9cc15cad1b',
      paper: request().paper,
      analysis,
      verifiedCitations: [],
      review: createReviewState(analysis.draft)
    })
    const working = applyLocalCheckpointSaved(
      applyCheckpointArmed(
        applyAnalysisResult(createSessionState({ paperSession: paperSession() }), {
          analysisResponse: analysis,
          verifiedCitations: [],
          reviewer: 'Kris Krüg',
          currentRunId: '77777777-7777-4777-8777-777777777777'
        }),
        checkpoint
      ),
      checkpoint.checkpointId
    )

    const deleted = applyLocalCheckpointDeleted(working, checkpoint.checkpointId)
    expect(deleted.activeCheckpointId).toBeNull()
    expect(deleted.pendingCheckpoint).toBeNull()
    expect(deleted.analysisResponse).toBe(analysis)
    expect(deleted.review?.reviewer).toBe('Kris Krüg')

    const otherActive = applyLocalCheckpointDeleted(
      { ...working, activeCheckpointId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      checkpoint.checkpointId
    )
    expect(otherActive.activeCheckpointId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(otherActive.pendingCheckpoint).toBeNull()

    const cleared = applyAllLocalCheckpointsDeleted(working)
    expect(cleared.activeCheckpointId).toBeNull()
    expect(cleared.pendingCheckpoint).toBeNull()
    expect(cleared.paperSession).toBe(working.paperSession)
  })
})
