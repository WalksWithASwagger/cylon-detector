import { describe, expect, it } from 'vitest'
import { benchmarkDefinition } from '@/bench/benchmark'
import { benchmarkDefinitionSchema, citationDraftSchema } from '@/bench/schema'
import { analysisRequestV2Schema } from '@/bench/v2/contracts'
import { defaultBenchmarkV2 } from '@/bench/v2/defaultRegistry'

describe('MAC benchmark definition', () => {
  it('ships exactly the three alpha challenges', () => {
    expect(benchmarkDefinition.challenges.map(challenge => challenge.id)).toEqual([
      'provenance-flip',
      'synesthesia',
      'blindsight'
    ])
  })

  it('requires all five scientific demands for every challenge', () => {
    for (const challenge of benchmarkDefinition.challenges) {
      expect(challenge.demands).toEqual([
        'explanation',
        'mechanism',
        'novelPrediction',
        'falsifier',
        'measurableWitness'
      ])
    }
  })

  it('rejects a benchmark challenge with a missing demand', () => {
    const broken = structuredClone(benchmarkDefinition)
    broken.challenges[0].demands = ['explanation'] as typeof broken.challenges[0]['demands']

    expect(benchmarkDefinitionSchema.safeParse(broken).success).toBe(false)
  })

  it('caps exported source excerpts to prevent paper-text redistribution', () => {
    expect(citationDraftSchema.safeParse({
      id: 'oversized',
      pdfPage: 1,
      quote: 'x'.repeat(601),
      supportsField: 'theory.centralClaims'
    }).success).toBe(false)
  })

  it('rejects analysis requests above the PDF byte and page boundaries', () => {
    const paper = {
      fileName: 'too-large.pdf',
      sha256: 'a'.repeat(64),
      textSha256: 'b'.repeat(64),
      byteSize: 20 * 1024 * 1024 + 1,
      pageCount: 81,
      characterCount: 81,
      pages: Array.from({ length: 81 }, (_, index) => ({ pdfPage: index + 1, text: 'x' }))
    }
    expect(analysisRequestV2Schema.safeParse({
      schemaVersion: 'mac-analysis-request/v2',
      benchmark: {
        id: defaultBenchmarkV2.id,
        version: defaultBenchmarkV2.version,
        integrityDigest: defaultBenchmarkV2.integrityDigest
      },
      paper
    }).success).toBe(false)
  })
})
