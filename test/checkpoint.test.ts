import { describe, expect, it } from 'vitest'
import { createMockAnalysis } from '@/bench/mockAnalysis'
import {
  checkpointPaperMatches,
  createCheckpoint,
  checkpointSchema
} from '@/bench/checkpoint'
import { createReviewState } from '@/bench/adjudication'
import { verifyCitations } from '@/bench/citationVerifier'
import type { AnalysisRequest } from '@/bench/schema'

const pageText = [
  'Conscious experience depends on a recurrent witness process before deliberate report.',
  'This second sentence represents the rest of the extracted page and must not be persisted merely to make resume convenient.'
].join(' ')

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
      title: 'Witness Theory',
      pages: [{ pdfPage: 1, text: pageText }]
    }
  }
}

describe('local checkpoints', () => {
  it('preserves review work without PDF bytes or full extracted page text', async () => {
    const input = request()
    const analysis = await createMockAnalysis(input)
    const citations = analysis.draft.challenges.flatMap(challenge =>
      challenge.explanation.citations
    )
    const checkpoint = await createCheckpoint({
      checkpointId: '404c91de-01e3-40c5-bd43-6a9cc15cad1b',
      savedAt: '2026-07-20T20:00:00.000Z',
      paper: input.paper,
      analysis,
      verifiedCitations: verifyCitations(input.paper.pages, citations),
      review: createReviewState(analysis.draft, 'Kris Krüg')
    })

    expect(checkpointSchema.parse(checkpoint)).toEqual(checkpoint)
    const serialized = JSON.stringify(checkpoint)
    expect(serialized).not.toContain('"pages"')
    expect(serialized).not.toContain(pageText)
    expect(serialized).toContain('Witness Theory')
    expect(serialized).toContain('Kris Krüg')
  })

  it('requires byte and extracted-text hashes to reconnect a PDF', async () => {
    const input = request()
    const analysis = await createMockAnalysis(input)
    const checkpoint = await createCheckpoint({
      checkpointId: '404c91de-01e3-40c5-bd43-6a9cc15cad1b',
      paper: input.paper,
      analysis,
      verifiedCitations: [],
      review: createReviewState(analysis.draft)
    })

    expect(checkpointPaperMatches(input.paper, checkpoint)).toBe(true)
    expect(checkpointPaperMatches({ ...input.paper, sha256: 'c'.repeat(64) }, checkpoint)).toBe(false)
    expect(checkpointPaperMatches({ ...input.paper, textSha256: 'd'.repeat(64) }, checkpoint)).toBe(false)
  })
})
