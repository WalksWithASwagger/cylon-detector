import { mkdir, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import { evaluationRunSchema } from '../src/bench/artifact'
import { benchmarkDefinitionSchema } from '../src/bench/schema'
import { benchmarkDefinitionV2Schema } from '../src/bench/v2/contracts'
import { evaluationRunV2Schema } from '../src/bench/v2/artifact'
import {
  blindReviewPacketSchema,
  reviewBundleSchema,
  reviewContributionSchema
} from '../src/bench/collaboration'
import { preregistrationSchema } from '../src/bench/research'

const schemas = [
  {
    fileName: 'benchmark-definition.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/benchmark-definition.v1.schema.json',
    title: 'MAC Consciousness Bench Definition v1',
    schema: benchmarkDefinitionSchema
  },
  {
    fileName: 'evaluation-run.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/evaluation-run.v1.schema.json',
    title: 'MAC Consciousness Evaluation Run v1',
    schema: evaluationRunSchema
  },
  {
    fileName: 'benchmark-definition.v2.schema.json',
    id: 'https://cylon-detector.org/schemas/benchmark-definition.v2.schema.json',
    title: 'MAC Consciousness Bench Definition v2',
    schema: benchmarkDefinitionV2Schema
  },
  {
    fileName: 'evaluation-run.v2.schema.json',
    id: 'https://cylon-detector.org/schemas/evaluation-run.v2.schema.json',
    title: 'MAC Consciousness Evaluation Run v2',
    schema: evaluationRunV2Schema
  },
  {
    fileName: 'blind-review-packet.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/blind-review-packet.v1.schema.json',
    title: 'Blind Review Packet v1',
    schema: blindReviewPacketSchema
  },
  {
    fileName: 'review-contribution.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/review-contribution.v1.schema.json',
    title: 'Review Contribution v1',
    schema: reviewContributionSchema
  },
  {
    fileName: 'review-bundle.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/review-bundle.v1.schema.json',
    title: 'Review Bundle v1',
    schema: reviewBundleSchema
  },
  {
    fileName: 'preregistration.v1.schema.json',
    id: 'https://cylon-detector.org/schemas/preregistration.v1.schema.json',
    title: 'MAC Preregistration v1',
    schema: preregistrationSchema
  }
]

await mkdir(new URL('../schemas/', import.meta.url), { recursive: true })

for (const definition of schemas) {
  const jsonSchema = z.toJSONSchema(definition.schema, {
    target: 'draft-2020-12',
    unrepresentable: 'throw'
  })
  const output = {
    $id: definition.id,
    title: definition.title,
    ...jsonSchema
  }
  await writeFile(
    new URL(`../schemas/${definition.fileName}`, import.meta.url),
    `${JSON.stringify(output, null, 2)}\n`
  )
}
