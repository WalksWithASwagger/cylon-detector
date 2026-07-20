import rawBenchmark from '../../benchmarks/mac-lab-001/0.1.0-alpha.1.json'
import { benchmarkDefinitionSchema } from './schema'

export const benchmarkDefinition = benchmarkDefinitionSchema.parse(rawBenchmark)
