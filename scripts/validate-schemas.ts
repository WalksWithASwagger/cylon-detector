import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { z } from 'zod'
import benchmark from '../benchmarks/mac-lab-001/0.1.0-alpha.1.json'
import { evaluationRunSchema, validateEvaluationRunArtifact } from '../src/bench/artifact'
import { benchmarkDefinitionSchema } from '../src/bench/schema'
import { benchmarkDefinitionV2Schema } from '../src/bench/v2/contracts'
import { evaluationRunV2Schema, validateEvaluationRunV2 } from '../src/bench/v2/artifact'
import {
  blindReviewPacketSchema,
  reviewBundleSchema,
  reviewContributionSchema
} from '../src/bench/collaboration'
import { preregistrationSchema } from '../src/bench/research'
import benchmarkV2 from '../benchmarks/mac-lab-001/1.0.0.json'

const definitions = [
  {
    name: 'benchmark definition',
    path: new URL('../schemas/benchmark-definition.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/benchmark-definition.v1.schema.json',
    title: 'MAC Consciousness Bench Definition v1',
    zodSchema: benchmarkDefinitionSchema
  },
  {
    name: 'evaluation run',
    path: new URL('../schemas/evaluation-run.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/evaluation-run.v1.schema.json',
    title: 'MAC Consciousness Evaluation Run v1',
    zodSchema: evaluationRunSchema
  },
  {
    name: 'benchmark definition v2',
    path: new URL('../schemas/benchmark-definition.v2.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/benchmark-definition.v2.schema.json',
    title: 'MAC Consciousness Bench Definition v2',
    zodSchema: benchmarkDefinitionV2Schema
  },
  {
    name: 'evaluation run v2',
    path: new URL('../schemas/evaluation-run.v2.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/evaluation-run.v2.schema.json',
    title: 'MAC Consciousness Evaluation Run v2',
    zodSchema: evaluationRunV2Schema
  },
  {
    name: 'blind review packet',
    path: new URL('../schemas/blind-review-packet.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/blind-review-packet.v1.schema.json',
    title: 'Blind Review Packet v1',
    zodSchema: blindReviewPacketSchema
  },
  {
    name: 'review contribution',
    path: new URL('../schemas/review-contribution.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/review-contribution.v1.schema.json',
    title: 'Review Contribution v1',
    zodSchema: reviewContributionSchema
  },
  {
    name: 'review bundle',
    path: new URL('../schemas/review-bundle.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/review-bundle.v1.schema.json',
    title: 'Review Bundle v1',
    zodSchema: reviewBundleSchema
  },
  {
    name: 'preregistration',
    path: new URL('../schemas/preregistration.v1.schema.json', import.meta.url),
    id: 'https://cylon-detector.org/schemas/preregistration.v1.schema.json',
    title: 'MAC Preregistration v1',
    zodSchema: preregistrationSchema
  }
]

const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false })
addFormats(ajv)
let validateBenchmark: ReturnType<typeof ajv.compile> | undefined

for (const definition of definitions) {
  const saved = JSON.parse(await readFile(definition.path, 'utf8')) as Record<string, unknown>
  const generated = {
    $id: definition.id,
    title: definition.title,
    ...z.toJSONSchema(definition.zodSchema, {
      target: 'draft-2020-12',
      unrepresentable: 'throw'
    })
  }
  if (JSON.stringify(saved) !== JSON.stringify(generated)) {
    throw new Error(`${definition.name} JSON Schema is stale. Run npm run generate:schemas.`)
  }
  const validate = ajv.compile(saved)
  if (definition.name === 'benchmark definition') validateBenchmark = validate
}

if (!validateBenchmark) throw new Error('Benchmark validator was not generated.')
if (!validateBenchmark(benchmark)) {
  throw new Error(`Benchmark does not validate: ${ajv.errorsText(validateBenchmark.errors)}`)
}
benchmarkDefinitionV2Schema.parse(benchmarkV2)

const demoArtifact = JSON.parse(
  await readFile(new URL('../fixtures/demo/witness-theory-adjudicated.json', import.meta.url), 'utf8')
)
await validateEvaluationRunArtifact(demoArtifact)

const demoArtifactV2 = JSON.parse(
  await readFile(new URL('../fixtures/demo/witness-theory-adjudicated.v2.json', import.meta.url), 'utf8')
)
await validateEvaluationRunV2(demoArtifactV2)

console.log(`Validated ${definitions.length} generated JSON Schemas, both benchmark contracts, the v1 importer fixture, and the canonical v2 demo receipt.`)
