import { describe, expect, it } from 'vitest'
import {
  FIXED_DEMANDS,
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema
} from '@/bench/v2/contracts'
import {
  resolveBenchmark
} from '@/bench/v2/registry'
import { sha256Text } from '@/bench/hash'
import { stableStringify } from '@/bench/artifact'
import {
  assertChallengeLifecycleTransition,
  assertInitialChallengeLifecycle,
  assertReplacementLinks
} from '../scripts/validate-benchmark-registry'

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

  it('rejects any mutation of an already published challenge version', () => {
    expect(() => assertChallengeLifecycleTransition(challenge, {
      ...challenge,
      rationale: 'A rewritten rationale.'
    })).toThrow(/immutable/i)
    expect(() => assertChallengeLifecycleTransition(challenge, {
      ...challenge,
      lifecycle: 'retired'
    })).toThrow(/immutable/i)
    expect(() => assertChallengeLifecycleTransition(
      challenge,
      challenge,
      '{"same":"meaning"}',
      '{ "same": "meaning" }'
    )).toThrow(/immutable/i)
  })

  it('permits only forward editable lifecycle transitions', () => {
    const draft = { ...challenge, lifecycle: 'draft' as const }
    const provisional = { ...challenge, lifecycle: 'provisional' as const }

    expect(() => assertChallengeLifecycleTransition(draft, provisional)).not.toThrow()
    expect(() => assertChallengeLifecycleTransition(provisional, challenge)).not.toThrow()
  })

  it('rejects skipped and backward lifecycle transitions', () => {
    const draft = { ...challenge, lifecycle: 'draft' as const }
    const provisional = { ...challenge, lifecycle: 'provisional' as const }

    expect(() => assertChallengeLifecycleTransition(draft, challenge)).toThrow(/invalid lifecycle transition/i)
    expect(() => assertChallengeLifecycleTransition(provisional, draft)).toThrow(/invalid lifecycle transition/i)
  })

  it('accepts a forward replacement that links to an immutable version', () => {
    const replacement = {
      ...challenge,
      version: '1.1.0',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: challenge.version }
    }

    expect(() => assertReplacementLinks([challenge, replacement])).not.toThrow()
  })

  it('accepts a higher-version retired tombstone for a published version', () => {
    const retirement = {
      ...challenge,
      version: '1.1.0',
      lifecycle: 'retired' as const,
      supersedes: { id: challenge.id, version: challenge.version }
    }

    expect(() => assertInitialChallengeLifecycle(retirement)).not.toThrow()
    expect(() => assertReplacementLinks([challenge, retirement])).not.toThrow()
  })

  it('requires ordinary new challenge versions to begin as drafts', () => {
    expect(() => assertInitialChallengeLifecycle(challenge)).toThrow(/must start as draft/i)
    expect(() => assertInitialChallengeLifecycle({
      ...challenge,
      lifecycle: 'draft'
    })).not.toThrow()
  })

  it('rejects replacement links that are missing, self-referential, or non-forward', () => {
    const missingTarget = {
      ...challenge,
      version: '1.1.0',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: '0.9.0' }
    }
    const selfReference = {
      ...challenge,
      supersedes: { id: challenge.id, version: challenge.version }
    }
    const nonForward = {
      ...challenge,
      version: '0.9.0',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: challenge.version }
    }

    expect(() => assertReplacementLinks([challenge, missingTarget])).toThrow(/does not exist/i)
    expect(() => assertReplacementLinks([selfReference])).toThrow(/itself/i)
    expect(() => assertReplacementLinks([challenge, nonForward])).toThrow(/newer semantic version/i)
  })

  it('requires a newer version of the same challenge to declare its predecessor', () => {
    const unlinkedReplacement = {
      ...challenge,
      version: '1.1.0',
      lifecycle: 'draft' as const
    }

    expect(() => assertReplacementLinks([challenge, unlinkedReplacement])).toThrow(/must declare supersedes/i)
  })

  it.each([
    '01.0.0',
    '1.0.0-01',
    '1.0.0-a..b'
  ])('rejects invalid SemVer replacement version %s', invalidVersion => {
    const replacement = {
      ...challenge,
      version: invalidVersion,
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: challenge.version }
    }

    expect(() => assertReplacementLinks([challenge, replacement])).toThrow(/invalid semantic version/i)
  })

  it('uses SemVer prerelease precedence for replacement links', () => {
    const releaseCandidate = {
      ...challenge,
      version: '2.0.0-rc.2'
    }
    const laterCandidate = {
      ...challenge,
      version: '2.0.0-rc.10',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: releaseCandidate.version }
    }
    const release = {
      ...challenge,
      version: '2.0.0',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: releaseCandidate.version }
    }

    expect(() => assertReplacementLinks([releaseCandidate, laterCandidate])).not.toThrow()
    expect(() => assertReplacementLinks([releaseCandidate, release])).not.toThrow()
  })

  it('does not treat build metadata as replacement precedence', () => {
    const buildOne = {
      ...challenge,
      version: '2.0.0+build.1'
    }
    const buildTwo = {
      ...challenge,
      version: '2.0.0+build.2',
      lifecycle: 'draft' as const,
      supersedes: { id: challenge.id, version: buildOne.version }
    }

    expect(() => assertReplacementLinks([buildOne, buildTwo])).toThrow(/newer semantic version/i)
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
