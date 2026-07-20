import { z } from 'zod'

export const challengeIdSchema = z.enum([
  'provenance-flip',
  'synesthesia',
  'blindsight'
])

export const demandKeySchema = z.enum([
  'explanation',
  'mechanism',
  'novelPrediction',
  'falsifier',
  'measurableWitness'
])

const requiredDemands = demandKeySchema.options

export const verdictSchema = z.enum([
  'survives',
  'strained',
  'evades',
  'breaks',
  'insufficient_evidence'
])

export const confidenceSchema = z.enum(['low', 'medium', 'high'])
export const citationVerificationSchema = z.enum(['exact', 'normalized', 'not_found'])

export const paperPageSchema = z.object({
  pdfPage: z.number().int().positive(),
  text: z.string()
})

export const citationDraftSchema = z.object({
  id: z.string().min(1),
  pdfPage: z.number().int().positive(),
  printedPageLabel: z.string().optional(),
  quote: z.string().min(1).max(600),
  locationHint: z.string().max(240).optional(),
  supportsField: z.string().min(1).max(240)
})

export const verifiedCitationSchema = citationDraftSchema.extend({
  verification: citationVerificationSchema,
  verifiedAt: z.string().datetime()
})

const supportedTextSchema = z.object({
  text: z.string().min(1),
  citations: z.array(citationDraftSchema)
})

const mechanismSchema = supportedTextSchema.extend({
  steps: z.array(z.string().min(1)).min(1)
})

const predictionSchema = supportedTextSchema.extend({
  intervention: z.string().min(1),
  independentVariable: z.string().min(1),
  dependentMeasure: z.string().min(1),
  populationOrSystem: z.string().min(1),
  directionalOutcome: z.string().min(1)
})

const falsifierSchema = supportedTextSchema.extend({
  incompatibleObservation: z.string().min(1),
  rationale: z.string().min(1)
})

const witnessSchema = supportedTextSchema.extend({
  observable: z.string().min(1),
  method: z.string().min(1),
  contrast: z.string().min(1),
  expectedSignature: z.string().min(1)
})

export const challengeDraftSchema = z.object({
  challengeId: challengeIdSchema,
  explanation: supportedTextSchema,
  mechanism: mechanismSchema,
  novelPrediction: predictionSchema,
  falsifier: falsifierSchema,
  measurableWitness: witnessSchema,
  evasionFlags: z.array(z.string()),
  proposedVerdict: verdictSchema,
  verdictRationale: z.string().min(1),
  extractionConfidence: confidenceSchema
})

export const aiDraftSchema = z.object({
  theory: z.object({
    name: z.string().min(1),
    summary: z.string().min(1),
    centralClaims: z.array(supportedTextSchema)
  }),
  challenges: z.array(challengeDraftSchema).length(3).superRefine((challenges, context) => {
    const ids = new Set(challenges.map(challenge => challenge.challengeId))
    for (const challengeId of challengeIdSchema.options) {
      if (!ids.has(challengeId)) {
        context.addIssue({
          code: 'custom',
          message: `Missing challenge ${challengeId}`
        })
      }
    }
  })
})

const benchmarkChallengeSchema = z.object({
  id: challengeIdSchema,
  name: z.string().min(1),
  shortName: z.string().min(1),
  phenomenon: z.string().min(1),
  adversarialPrompt: z.string().min(1),
  rationale: z.string().min(1),
  empiricalAnchors: z.array(z.object({
    label: z.string().min(1),
    doi: z.string().optional(),
    url: z.string().url()
  })).min(1),
  demands: z.array(demandKeySchema).length(5).refine(
    demands => requiredDemands.every(demand => demands.includes(demand)),
    'Every challenge must include all five demands'
  )
})

export const benchmarkDefinitionSchema = z.object({
  schemaVersion: z.literal('mac-benchmark-definition/v1'),
  id: z.literal('mac-lab-001'),
  version: z.string().min(1),
  status: z.literal('provisional'),
  title: z.string().min(1),
  description: z.string().min(1),
  authors: z.array(z.object({
    name: z.string().min(1),
    role: z.string().min(1)
  })).min(1),
  sourceUrls: z.array(z.string().url()).min(1),
  createdAt: z.string().datetime(),
  demands: z.array(demandKeySchema).length(5),
  challenges: z.array(benchmarkChallengeSchema).length(3)
})

export const analysisPaperSchema = z.object({
    fileName: z.string().min(1).max(240),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    textSha256: z.string().regex(/^[a-f0-9]{64}$/),
    byteSize: z.number().int().positive().max(20 * 1024 * 1024),
    pageCount: z.number().int().positive().max(80),
    characterCount: z.number().int().positive().max(350_000),
    title: z.string().max(500).optional(),
    authors: z.array(z.string().max(240)).max(50).optional(),
    year: z.number().int().min(1600).max(2200).optional(),
    doi: z.string().max(240).optional(),
    sourceUrl: z.string().url().optional(),
    pages: z.array(paperPageSchema).min(1).max(80)
  }).superRefine((paper, context) => {
    const actualCharacters = paper.pages.reduce((total, page) => total + page.text.length, 0)
    if (actualCharacters !== paper.characterCount) {
      context.addIssue({
        code: 'custom',
        path: ['characterCount'],
        message: 'Character count does not match page text'
      })
    }
    if (paper.pages.length !== paper.pageCount) {
      context.addIssue({
        code: 'custom',
        path: ['pageCount'],
        message: 'Page count does not match pages'
      })
    }
  })

export const analysisRequestSchema = z.object({
  benchmarkVersion: z.literal('0.1.0-alpha.1'),
  paper: analysisPaperSchema
})

export type ChallengeId = z.infer<typeof challengeIdSchema>
export type DemandKey = z.infer<typeof demandKeySchema>
export type Verdict = z.infer<typeof verdictSchema>
export type PaperPage = z.infer<typeof paperPageSchema>
export type CitationDraft = z.infer<typeof citationDraftSchema>
export type VerifiedCitation = z.infer<typeof verifiedCitationSchema>
export type BenchmarkDefinition = z.infer<typeof benchmarkDefinitionSchema>
export type AiDraft = z.infer<typeof aiDraftSchema>
export type ChallengeDraft = z.infer<typeof challengeDraftSchema>
export type AnalysisRequest = z.infer<typeof analysisRequestSchema>
