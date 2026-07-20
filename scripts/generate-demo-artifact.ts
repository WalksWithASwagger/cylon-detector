import { mkdir, writeFile } from 'node:fs/promises'
import { applyReviewDecision, createReviewState } from '../src/bench/adjudication'
import { createEvaluationRun } from '../src/bench/artifact'
import { normalizeEvaluationRun } from '../src/bench/v2/artifact'
import { benchmarkDefinition } from '../src/bench/benchmark'
import { verifyCitation } from '../src/bench/citationVerifier'
import { sha256Text } from '../src/bench/hash'
import { createMockAnalysis } from '../src/bench/mockAnalysis'
import { analysisRequestSchema, type CitationDraft, type DemandKey } from '../src/bench/schema'

const timestamp = '2026-07-20T20:00:00.000Z'
const text = 'Conscious experience depends on a recurrent witness process that integrates sensory evidence before deliberate report.'
const normalizedText = `[PDF_PAGE_1]\n${text}`
const request = analysisRequestSchema.parse({
  benchmarkVersion: '0.1.0-alpha.1',
  paper: {
    fileName: 'witness-theory.pdf',
    sha256: await sha256Text('synthetic-pdf-fixture'),
    textSha256: await sha256Text(normalizedText),
    byteSize: 2048,
    pageCount: 1,
    characterCount: text.length,
    title: 'Witness Theory',
    authors: ['Ada Witness', 'Kris Krüg'],
    year: 2026,
    pages: [{ pdfPage: 1, text }]
  }
})
const response = await createMockAnalysis(request, performance.now())
const draft = response.draft
const demandKeys: DemandKey[] = ['explanation', 'mechanism', 'novelPrediction', 'falsifier', 'measurableWitness']
const citations: CitationDraft[] = [...draft.theory.centralClaims.flatMap(claim => claim.citations)]
for (const challenge of draft.challenges) {
  for (const field of demandKeys) citations.push(...challenge[field].citations)
}
const verifiedCitations = citations.map(citation => verifyCitation(request.paper.pages, citation, timestamp))

let review = createReviewState(draft, 'Kris Krüg', timestamp)
for (const challenge of draft.challenges) {
  for (const field of demandKeys) {
    review = challenge.challengeId === 'provenance-flip' && field === 'mechanism'
      ? applyReviewDecision(review, {
          challengeId: challenge.challengeId,
          field,
          decision: 'revised',
          adjudicatedValue: 'Human revision: the witness must causally precede evaluation and report.',
          reason: 'The mock mechanism did not discriminate experience from later evaluation.'
        })
      : applyReviewDecision(review, { challengeId: challenge.challengeId, field, decision: 'accepted' })
  }
  review = applyReviewDecision(review, {
    challengeId: challenge.challengeId,
    field: 'verdict',
    decision: 'accepted'
  })
}

const { pages: _pages, ...paper } = request.paper
const alphaRun = await createEvaluationRun({
  runId: '00000000-0000-4000-8000-000000000001',
  createdAt: timestamp,
  sourceCommit: 'demo-fixture',
  paper,
  benchmark: benchmarkDefinition,
  draft,
  verifiedCitations,
  review,
  analysis: {
    ...response.analysis,
    responseId: 'mock-demo-fixture',
    latencyMs: 0
  }
})
const run = await normalizeEvaluationRun(alphaRun)

const destination = new URL('../fixtures/demo/witness-theory-adjudicated.v2.json', import.meta.url)
await mkdir(new URL('../fixtures/demo/', import.meta.url), { recursive: true })
await writeFile(destination, `${JSON.stringify(run, null, 2)}\n`)
