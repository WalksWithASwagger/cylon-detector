import { z } from 'zod'
import { analysisPaperSchema, type AnalysisRequest } from '../schema'

export const FIXED_DEMANDS = [
  'explanation',
  'mechanism',
  'novelPrediction',
  'falsifier',
  'measurableWitness'
] as const

export const slugSchema = z.string().regex(
  /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
  'Use a lowercase, hyphen-separated slug'
)
export const semanticVersionSchema = z.string().regex(
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/,
  'Use a semantic version'
)
export const integrityDigestSchema = z.string().regex(/^[a-f0-9]{64}$/)
export const lifecycleSchema = z.enum(['draft', 'provisional', 'published', 'retired'])
export const demandKeyV2Schema = z.enum(FIXED_DEMANDS)

export const fixedDemandsSchema = z.array(demandKeyV2Schema).length(5).superRefine((demands, context) => {
  if (demands.some((demand, index) => demand !== FIXED_DEMANDS[index])) {
    context.addIssue({ code: 'custom', message: 'Use the five fixed demands in canonical order' })
  }
})

export const authorshipSchema = z.object({
  name: z.string().min(1),
  role: z.string().min(1),
  identifier: z.string().url().optional()
})

export const empiricalAnchorSchema = z.object({
  label: z.string().min(1),
  doi: z.string().min(1).optional(),
  url: z.string().url()
})

export const challengeDefinitionV2Schema = z.object({
  schemaVersion: z.literal('mac-challenge-definition/v2'),
  id: slugSchema,
  version: semanticVersionSchema,
  lifecycle: lifecycleSchema,
  title: z.string().min(1),
  phenomenon: z.string().min(1),
  adversarialPrompt: z.string().min(1),
  rationale: z.string().min(1),
  assumptions: z.array(z.string().min(1)),
  knownConfounds: z.array(z.string().min(1)),
  targetCommitments: z.array(z.string().min(1)),
  empiricalAnchors: z.array(empiricalAnchorSchema).min(1),
  authorship: z.array(authorshipSchema).min(1),
  changeMindObservation: z.string().min(1),
  demands: fixedDemandsSchema,
  createdAt: z.string().datetime(),
  supersedes: z.object({ id: slugSchema, version: semanticVersionSchema }).optional()
})

export const challengeReferenceSchema = z.object({
  id: slugSchema,
  version: semanticVersionSchema,
  integrityDigest: integrityDigestSchema
})

export const benchmarkDefinitionV2Schema = z.object({
  schemaVersion: z.literal('mac-benchmark-definition/v2'),
  id: slugSchema,
  version: semanticVersionSchema,
  lifecycle: lifecycleSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  authorship: z.array(authorshipSchema).min(1),
  sourceUrls: z.array(z.string().url()).min(1),
  createdAt: z.string().datetime(),
  demands: fixedDemandsSchema,
  challenges: z.array(challengeReferenceSchema).min(1).superRefine((references, context) => {
    const keys = references.map(reference => `${reference.id}@${reference.version}`)
    if (new Set(keys).size !== keys.length) {
      context.addIssue({ code: 'custom', message: 'Challenge references must be unique' })
    }
  }),
  integrityDigest: integrityDigestSchema
})

export const benchmarkRequestSchema = z.object({
  id: slugSchema,
  version: semanticVersionSchema,
  integrityDigest: integrityDigestSchema
})

export const analysisRequestV2Schema = z.object({
  schemaVersion: z.literal('mac-analysis-request/v2'),
  benchmark: benchmarkRequestSchema,
  paper: analysisPaperSchema
})

export type DemandKeyV2 = z.infer<typeof demandKeyV2Schema>
export type ChallengeDefinitionV2 = z.infer<typeof challengeDefinitionV2Schema>
export type BenchmarkDefinitionV2 = z.infer<typeof benchmarkDefinitionV2Schema>
export type BenchmarkRequest = z.infer<typeof benchmarkRequestSchema>
export type AnalysisRequestV2 = z.infer<typeof analysisRequestV2Schema>

export function toLegacyAnalysisRequest(request: AnalysisRequestV2): AnalysisRequest {
  return {
    benchmarkVersion: '0.1.0-alpha.1',
    paper: request.paper
  }
}
