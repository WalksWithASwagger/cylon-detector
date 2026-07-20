import { z } from 'zod'
import { analysisMetadataSchema } from './artifact'
import { aiDraftSchema } from './schema'

export const analysisResponseSchema = z.object({
  draft: aiDraftSchema,
  analysis: analysisMetadataSchema
})

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>
