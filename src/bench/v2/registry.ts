import { sha256Text } from '../hash'
import { stableStringify } from '../artifact'
import {
  benchmarkRequestSchema,
  challengeDefinitionV2Schema,
  type BenchmarkDefinitionV2,
  type BenchmarkRequest,
  type ChallengeDefinitionV2
} from './contracts'

export interface BenchmarkRegistry {
  benchmarks: BenchmarkDefinitionV2[]
  challenges: ChallengeDefinitionV2[]
}

function immutableChallengeContent(challenge: ChallengeDefinitionV2) {
  const { lifecycle, ...content } = challenge
  return content
}

export function assertPublishedChallengeImmutable(
  previous: ChallengeDefinitionV2,
  next: ChallengeDefinitionV2
): void {
  if (previous.id !== next.id || previous.version !== next.version) return
  if (previous.lifecycle !== 'published') return
  if (next.lifecycle !== 'published' && next.lifecycle !== 'retired') {
    throw new Error('A published challenge version cannot return to an editable lifecycle')
  }
  if (stableStringify(immutableChallengeContent(previous)) !== stableStringify(immutableChallengeContent(next))) {
    throw new Error('Published challenge versions are immutable; create a new version')
  }
}

export async function challengeIntegrityDigest(challenge: ChallengeDefinitionV2): Promise<string> {
  return sha256Text(stableStringify(challengeDefinitionV2Schema.parse(challenge)))
}

export async function benchmarkIntegrityDigest(
  benchmark: Omit<BenchmarkDefinitionV2, 'integrityDigest'>
): Promise<string> {
  return sha256Text(stableStringify(benchmark))
}

export async function resolveBenchmark(
  registry: BenchmarkRegistry,
  requestedInput: BenchmarkRequest
): Promise<{ benchmark: BenchmarkDefinitionV2; challenges: ChallengeDefinitionV2[] }> {
  const requested = benchmarkRequestSchema.parse(requestedInput)
  const benchmark = registry.benchmarks.find(candidate =>
    candidate.id === requested.id && candidate.version === requested.version
  )
  if (!benchmark) throw new Error(`Unknown benchmark ${requested.id}@${requested.version}`)
  if (benchmark.integrityDigest !== requested.integrityDigest) {
    throw new Error('Benchmark digest mismatch')
  }

  const { integrityDigest, ...unsignedBenchmark } = benchmark
  if (await benchmarkIntegrityDigest(unsignedBenchmark) !== integrityDigest) {
    throw new Error('Canonical benchmark digest mismatch')
  }

  const challenges: ChallengeDefinitionV2[] = []
  for (const reference of benchmark.challenges) {
    const challenge = registry.challenges.find(candidate =>
      candidate.id === reference.id && candidate.version === reference.version
    )
    if (!challenge) throw new Error(`Unknown challenge ${reference.id}@${reference.version}`)
    if (await challengeIntegrityDigest(challenge) !== reference.integrityDigest) {
      throw new Error(`Challenge digest mismatch for ${reference.id}@${reference.version}`)
    }
    challenges.push(challenge)
  }

  return { benchmark, challenges }
}
