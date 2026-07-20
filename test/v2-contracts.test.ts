import { describe, expect, it } from 'vitest'
import {
  FIXED_DEMANDS,
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema
} from '@/bench/v2/contracts'
import {
  assertPublishedChallengeImmutable,
  resolveBenchmark
} from '@/bench/v2/registry'
import { sha256Text } from '@/bench/hash'
import { stableStringify } from '@/bench/artifact'

const challenge = challengeDefinitionV2Schema.parse({
  schemaVersion: 'mac-challenge-definition/v2',
  id: 'provenance-flip',
  version: '1.0.0',
  lifecycle: 'published',
  title: 'The Provenance Flip',
  phenomenon: 'Origin knowledge changes the experience of an unchanged work.',
  adversarialPrompt: 'Explain the change without changing the sensory input.',
  rationale: 'The phenomenon separates sensory input from conscious interpretation.',
  assumptions: ['The stimulus bytes remain unchanged.'],
  knownConfounds: ['Demand characteristics.'],
  targetCommitments: ['Top-down access to phenomenal content.'],
  empiricalAnchors: [{
    label: 'MAC Lab #001',
    url: 'https://mac.bc-ai.ca/ai-events/lab-001-minimum-viable-consciousness-requirements/'
  }],
  authorship: [{ name: 'Kris Krüg', role: 'challenge author' }],
  changeMindObservation: 'No pre-report difference under blinded replication.',
  demands: FIXED_DEMANDS,
  createdAt: '2026-07-20T00:00:00.000Z'
})

describe('v2 challenge and benchmark contracts', () => {
  it('accepts a new validated challenge slug without changing TypeScript', () => {
    expect(challengeDefinitionV2Schema.parse({
      ...challenge,
      id: 'temporal-binding-window',
      version: '0.1.0',
      lifecycle: 'draft'
    }).id).toBe('temporal-binding-window')
  })

  it('requires the fixed five demands exactly once', () => {
    expect(challengeDefinitionV2Schema.safeParse({
      ...challenge,
      demands: FIXED_DEMANDS.slice(0, 4)
    }).success).toBe(false)
  })

  it('rejects mutation of an already published challenge version', () => {
    expect(() => assertPublishedChallengeImmutable(challenge, {
      ...challenge,
      rationale: 'A rewritten rationale.'
    })).toThrow(/immutable/i)
    expect(() => assertPublishedChallengeImmutable(challenge, {
      ...challenge,
      lifecycle: 'retired'
    })).not.toThrow()
  })

  it('resolves exact challenge versions and rejects benchmark digest mismatch', async () => {
    const challengeDigest = await sha256Text(stableStringify(challenge))
    const benchmarkWithoutDigest = {
      schemaVersion: 'mac-benchmark-definition/v2' as const,
      id: 'mac-lab-001',
      version: '1.0.0',
      lifecycle: 'provisional' as const,
      title: 'MAC Lab #001',
      description: 'A versioned adversarial consciousness benchmark.',
      authorship: [{ name: 'MAC', role: 'benchmark steward' }],
      sourceUrls: ['https://mac.bc-ai.ca/'],
      createdAt: '2026-07-20T00:00:00.000Z',
      demands: FIXED_DEMANDS,
      challenges: [{ id: challenge.id, version: challenge.version, integrityDigest: challengeDigest }]
    }
    const benchmarkDigest = await sha256Text(stableStringify(benchmarkWithoutDigest))
    const benchmark = benchmarkDefinitionV2Schema.parse({
      ...benchmarkWithoutDigest,
      integrityDigest: benchmarkDigest
    })

    await expect(resolveBenchmark(
      { benchmarks: [benchmark], challenges: [challenge] },
      { id: benchmark.id, version: benchmark.version, integrityDigest: benchmarkDigest }
    )).resolves.toMatchObject({ benchmark, challenges: [challenge] })

    await expect(resolveBenchmark(
      { benchmarks: [benchmark], challenges: [challenge] },
      { id: benchmark.id, version: benchmark.version, integrityDigest: '0'.repeat(64) }
    )).rejects.toThrow(/digest mismatch/i)
  })
})
