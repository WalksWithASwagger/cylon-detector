import rawLegacyBenchmark from '../../benchmarks/mac-lab-001/0.1.0-alpha.1.json'
import {
  evaluationRunSchema,
  stableStringify,
  validateEvaluationRunArtifact
} from '../../src/bench/artifact'
import { sha256Text } from '../../src/bench/hash'
import { benchmarkDefinitionSchema } from '../../src/bench/schema'
import {
  normalizeEvaluationRun,
  validateEvaluationRunV2,
  type EvaluationRunV2
} from '../../src/bench/v2/artifact'
import { defaultBenchmarkRegistry } from '../../src/bench/v2/defaultRegistry'
import { resolveBenchmark } from '../../src/bench/v2/registry'
import { ReceiptConformanceError, type ConformanceManifest } from './errors'
import { record } from './input'

const SYNTHETIC_LEGACY_BENCHMARK_DIGEST = '4df227118712dfa6bd9c1ca6337c07bc4ef5f757f10e916d834dc36b636f68d6'

export function originalSchemaVersion(input: unknown): ConformanceManifest['originalSchemaVersion'] {
  const version = record(input, 'Receipt').schemaVersion
  if (version !== 'mac-evaluation-run/v1' && version !== 'mac-evaluation-run/v2') {
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt schemaVersion must be mac-evaluation-run/v1 or mac-evaluation-run/v2.')
  }
  return version
}

export async function assertAllowedLegacyBenchmark(input: unknown): Promise<void> {
  let run
  try {
    run = await validateEvaluationRunArtifact(evaluationRunSchema.parse(input))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/artifact digest|digest does not match/i.test(message)) {
      throw new ReceiptConformanceError(
        'RECEIPT_INTEGRITY',
        'Legacy receipt integrity digest does not match; no outputs were written.',
        error
      )
    }
    throw new ReceiptConformanceError('INPUT_INVALID', 'Legacy receipt failed canonical schema validation.', error)
  }

  const benchmarkDigest = await sha256Text(stableStringify(run.benchmark))
  if (benchmarkDigest !== run.benchmarkDigest) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Legacy benchmark digest does not match its digest-bound definition.'
    )
  }

  const canonicalLegacyBenchmark = benchmarkDefinitionSchema.parse(rawLegacyBenchmark)
  const canonicalLegacyDigest = await sha256Text(stableStringify(canonicalLegacyBenchmark))
  if (benchmarkDigest !== canonicalLegacyDigest && benchmarkDigest !== SYNTHETIC_LEGACY_BENCHMARK_DIGEST) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Legacy benchmark has no explicit mapping to the canonical v2 registry.'
    )
  }
}

export function assertReviewHistoryOrder(input: unknown): void {
  const receipt = record(input, 'Receipt')
  if (receipt.schemaVersion !== 'mac-evaluation-run/v2') return
  if (!Array.isArray(receipt.reviewEvents)) {
    throw new ReceiptConformanceError('REVIEW_HISTORY', 'reviewEvents must be an array.')
  }

  const eventIds = new Set<string>()
  receipt.reviewEvents.forEach((candidate, index) => {
    const event = record(candidate, `reviewEvents[${index}]`)
    if (event.sequence !== index + 1) {
      throw new ReceiptConformanceError(
        'REVIEW_HISTORY',
        `Review event sequence is invalid at array position ${index + 1}; expected sequence ${index + 1}.`
      )
    }
    if (typeof event.eventId !== 'string' || eventIds.has(event.eventId)) {
      throw new ReceiptConformanceError('REVIEW_HISTORY', `Review event ID is missing or duplicated at sequence ${index + 1}.`)
    }
    eventIds.add(event.eventId)
  })
}

export async function normalizeAndVerify(input: unknown): Promise<EvaluationRunV2> {
  try {
    const normalized = await normalizeEvaluationRun(input)
    return await validateEvaluationRunV2(normalized)
  } catch (error) {
    if (error instanceof ReceiptConformanceError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/integrity digest|artifact digest|digest does not match/i.test(message)) {
      throw new ReceiptConformanceError(
        'RECEIPT_INTEGRITY',
        'Receipt integrity digest does not match; no outputs were written.',
        error
      )
    }
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt failed canonical schema validation; no outputs were written.', error)
  }
}

export async function assertCanonicalBenchmark(run: EvaluationRunV2): Promise<void> {
  try {
    const canonical = await resolveBenchmark(defaultBenchmarkRegistry, {
      id: run.benchmark.definition.id,
      version: run.benchmark.definition.version,
      integrityDigest: run.benchmark.definition.integrityDigest
    })
    if (stableStringify(run.benchmark.definition) !== stableStringify(canonical.benchmark)) {
      throw new Error('Benchmark definition snapshot differs from the canonical registry')
    }
    if (stableStringify(run.benchmark.challenges) !== stableStringify(canonical.challenges)) {
      throw new Error('Challenge snapshots differ from the canonical registry')
    }
  } catch (error) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Receipt benchmark definition or challenge snapshot does not match the canonical registry; no outputs were written.',
      error
    )
  }
}
