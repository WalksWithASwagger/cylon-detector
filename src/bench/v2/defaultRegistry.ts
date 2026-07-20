import rawBenchmark from '../../../benchmarks/mac-lab-001/1.0.0.json'
import rawProvenanceFlip from '../../../benchmarks/challenges/provenance-flip/1.0.0.json'
import rawSynesthesia from '../../../benchmarks/challenges/synesthesia/1.0.0.json'
import rawBlindsight from '../../../benchmarks/challenges/blindsight/1.0.0.json'
import {
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema
} from './contracts'
import type { BenchmarkRegistry } from './registry'

export const defaultBenchmarkV2 = benchmarkDefinitionV2Schema.parse(rawBenchmark)

export const defaultChallengeDefinitions = [
  rawProvenanceFlip,
  rawSynesthesia,
  rawBlindsight
].map(challenge => challengeDefinitionV2Schema.parse(challenge))

export const defaultBenchmarkRegistry: BenchmarkRegistry = {
  benchmarks: [defaultBenchmarkV2],
  challenges: defaultChallengeDefinitions
}
