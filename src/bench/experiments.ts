import { z } from 'zod'
import { stableStringify } from './artifact'
import { sha256Text } from './hash'
import { integrityDigestSchema, lifecycleSchema, semanticVersionSchema, slugSchema } from './v2/contracts'

export const evidenceLaneSchema = z.enum([
  'architectural',
  'behavioural',
  'intervention',
  'self_report',
  'counterevidence'
])

const indicatorSchema = z.object({
  id: slugSchema,
  lane: evidenceLaneSchema,
  name: z.string().min(1),
  description: z.string().min(1),
  expectedEvidence: z.array(z.string().min(1)).min(1),
  counterevidence: z.array(z.string().min(1)).min(1)
})

export const indicatorBundleSchema = z.object({
  schemaVersion: z.literal('ai-consciousness-indicator-bundle/v1'),
  id: slugSchema,
  version: semanticVersionSchema,
  lifecycle: lifecycleSchema,
  theory: z.object({
    name: z.string().min(1),
    citation: z.string().min(1),
    version: z.string().min(1)
  }),
  indicators: z.array(indicatorSchema).min(5).superRefine((indicators, context) => {
    const lanes = new Set(indicators.map(indicator => indicator.lane))
    for (const lane of evidenceLaneSchema.options) {
      if (!lanes.has(lane)) context.addIssue({ code: 'custom', message: `Missing ${lane} evidence lane` })
    }
  }),
  integrityDigest: integrityDigestSchema.optional()
})

export type IndicatorBundle = z.infer<typeof indicatorBundleSchema>

const indicatorObservationSchema = z.object({
  indicatorId: slugSchema,
  lane: evidenceLaneSchema,
  observations: z.array(z.string().min(1)),
  counterevidence: z.array(z.string().min(1)),
  uncertainty: z.enum(['low', 'medium', 'high', 'unknown']),
  theoryDependence: z.string().min(1)
})

export const evidenceProfileSchema = z.object({
  schemaVersion: z.literal('ai-consciousness-evidence-profile/v1'),
  profileId: z.string().uuid(),
  createdAt: z.string().datetime(),
  indicatorBundle: z.object({ id: slugSchema, version: semanticVersionSchema, integrityDigest: integrityDigestSchema }),
  lanes: z.array(z.object({
    lane: evidenceLaneSchema,
    evidence: z.array(indicatorObservationSchema)
  })).length(5),
  conclusionBoundary: z.literal('This is a theory-dependent evidence profile with uncertainty, not a binary Cylon detected conclusion or consciousness score.'),
  integrityDigest: integrityDigestSchema
})

export async function buildEvidenceProfile(
  bundleInput: IndicatorBundle,
  observationInputs: z.infer<typeof indicatorObservationSchema>[],
  profileId = crypto.randomUUID(),
  createdAt = new Date().toISOString()
) {
  const bundle = indicatorBundleSchema.parse(bundleInput)
  const observations = observationInputs.map(observation => indicatorObservationSchema.parse(observation))
  const indicatorLanes = new Map(bundle.indicators.map(indicator => [indicator.id, indicator.lane]))
  for (const observation of observations) {
    if (indicatorLanes.get(observation.indicatorId) !== observation.lane) {
      throw new Error(`Observation lane mismatch for ${observation.indicatorId}`)
    }
  }
  const bundleDigest = await sha256Text(stableStringify(bundle))
  const unsigned = {
    schemaVersion: 'ai-consciousness-evidence-profile/v1' as const,
    profileId,
    createdAt,
    indicatorBundle: { id: bundle.id, version: bundle.version, integrityDigest: bundleDigest },
    lanes: evidenceLaneSchema.options.map(lane => ({
      lane,
      evidence: observations.filter(observation => observation.lane === lane)
    })),
    conclusionBoundary: 'This is a theory-dependent evidence profile with uncertainty, not a binary Cylon detected conclusion or consciousness score.' as const
  }
  return evidenceProfileSchema.parse({ ...unsigned, integrityDigest: await sha256Text(stableStringify(unsigned)) })
}

export const aiSystemTestEthicsGateSchema = z.object({
  schemaVersion: z.literal('ai-system-test-ethics-gate/v1'),
  purpose: z.string().min(1),
  systemUnderTest: z.string().min(1),
  namedHumanOwner: z.string().min(1),
  interventionRisk: z.enum(['low', 'medium', 'high', 'unknown']),
  interventions: z.array(z.string().min(1)).min(1),
  welfareRisks: z.array(z.string().min(1)).min(1),
  stopConditions: z.array(z.string().min(1)).min(1),
  dataHandling: z.string().min(1),
  publicationPlan: z.string().min(1),
  ownerApprovedAt: z.string().datetime(),
  ethicsReview: z.enum(['pending', 'approved', 'rejected'])
})

export function authorizeLiveSystemTest(input: unknown) {
  const gate = aiSystemTestEthicsGateSchema.parse(input)
  if (gate.ethicsReview !== 'approved') throw new Error('Live AI-system testing requires an approved ethics and welfare gate')
  return {
    schemaVersion: 'ai-system-test-session/v1' as const,
    sessionId: crypto.randomUUID(),
    authorizedAt: new Date().toISOString(),
    state: 'authorized_not_started' as const,
    gate,
    boundary: 'Authorization records human ownership and stop conditions; it does not execute an intervention.' as const
  }
}

export const provenanceFlipStudyProtocolSchema = z.object({
  schemaVersion: z.literal('provenance-flip-study-protocol/v1'),
  enabled: z.boolean(),
  collectionState: z.enum(['disabled', 'ready']),
  purpose: z.string().min(1),
  consentProtocolApproved: z.boolean(),
  deceptionProtocolApproved: z.boolean(),
  debriefProtocolApproved: z.boolean(),
  retentionProtocolApproved: z.boolean(),
  ethicsReviewApproved: z.boolean()
})

export function authorizeProvenanceFlipStudy(input: unknown) {
  const protocol = provenanceFlipStudyProtocolSchema.parse(input)
  if (!protocol.enabled || protocol.collectionState !== 'ready') {
    throw new Error('The Provenance Flip study module is disabled')
  }
  const approvals = [
    protocol.consentProtocolApproved,
    protocol.deceptionProtocolApproved,
    protocol.debriefProtocolApproved,
    protocol.retentionProtocolApproved,
    protocol.ethicsReviewApproved
  ]
  if (approvals.some(approval => !approval)) {
    throw new Error('Consent, deception, debrief, retention, and ethics approvals are all required')
  }
  return { ...protocol, authorizedAt: new Date().toISOString() }
}

export const c2paProvenanceInputSchema = z.object({
  schemaVersion: z.literal('c2pa-provenance-input/v1'),
  manifestId: z.string().min(1),
  signatureStatus: z.enum(['valid', 'invalid', 'unknown', 'not_present']),
  assertions: z.array(z.string().min(1)),
  interpretationBoundary: z.literal('Cryptographic provenance can bind assertions to an asset; it does not establish truth, trust, consent, or conscious authorship.')
})
