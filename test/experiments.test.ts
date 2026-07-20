import { describe, expect, it } from 'vitest'
import {
  authorizeLiveSystemTest,
  authorizeProvenanceFlipStudy,
  buildEvidenceProfile,
  c2paProvenanceInputSchema,
  indicatorBundleSchema,
  provenanceFlipStudyProtocolSchema
} from '@/bench/experiments'

const bundle = indicatorBundleSchema.parse({
  schemaVersion: 'ai-consciousness-indicator-bundle/v1',
  id: 'minimal-witness-indicators',
  version: '0.1.0-draft',
  lifecycle: 'draft',
  theory: { name: 'Witness theory', citation: 'Theory source', version: '1.0.0' },
  indicators: [
    { id: 'architecture-1', lane: 'architectural', name: 'Architecture', description: 'A theory-derived architecture.', expectedEvidence: ['Persistent workspace.'], counterevidence: ['Feed-forward only.'] },
    { id: 'behaviour-1', lane: 'behavioural', name: 'Behaviour', description: 'A theory-derived behaviour.', expectedEvidence: ['Cross-context report.'], counterevidence: ['Prompt mimicry.'] },
    { id: 'intervention-1', lane: 'intervention', name: 'Intervention', description: 'A causal intervention.', expectedEvidence: ['Selective degradation.'], counterevidence: ['No causal change.'] },
    { id: 'self-report-1', lane: 'self_report', name: 'Self-report', description: 'A bounded report.', expectedEvidence: ['Calibrated uncertainty.'], counterevidence: ['Sycophancy.'] },
    { id: 'counterevidence-1', lane: 'counterevidence', name: 'Counterevidence', description: 'A disconfirming lane.', expectedEvidence: ['Alternative mechanism.'], counterevidence: ['No alternative tested.'] }
  ]
})

describe('Cylon Detector proper safety contracts', () => {
  it('keeps evidence lanes separate and produces a theory-dependent profile without a binary conclusion', async () => {
    const profile = await buildEvidenceProfile(bundle, bundle.indicators.map(indicator => ({
      indicatorId: indicator.id,
      lane: indicator.lane,
      observations: [],
      counterevidence: indicator.counterevidence,
      uncertainty: 'high' as const,
      theoryDependence: 'Only relevant under Witness theory.'
    })))

    expect(new Set(profile.lanes.map(lane => lane.lane)).size).toBe(5)
    expect(profile.conclusionBoundary).toMatch(/not a binary/i)
    expect(profile).not.toHaveProperty('binaryConclusion')
    expect(profile).not.toHaveProperty('score')
  })

  it('blocks a live AI-system session until a named owner and welfare gate are approved', () => {
    expect(() => authorizeLiveSystemTest({
      schemaVersion: 'ai-system-test-ethics-gate/v1',
      purpose: 'Evaluate theory-derived indicators.',
      systemUnderTest: 'Local test system',
      namedHumanOwner: 'Kris Krüg',
      interventionRisk: 'unknown',
      interventions: ['Interrupt a test process.'],
      welfareRisks: ['Unknown moral-patient status.'],
      stopConditions: ['Any sign of distress or uncontrolled persistence.'],
      dataHandling: 'Local only.',
      publicationPlan: 'No publication without review.',
      ownerApprovedAt: '2026-07-20T20:00:00.000Z',
      ethicsReview: 'pending'
    })).toThrow(/approved/i)
  })

  it('keeps the Provenance Flip study disabled without consent, deception, debrief, retention, and ethics approvals', () => {
    const protocol = provenanceFlipStudyProtocolSchema.parse({
      schemaVersion: 'provenance-flip-study-protocol/v1',
      enabled: false,
      collectionState: 'disabled',
      purpose: 'Test provenance-induced aesthetic reversal.',
      consentProtocolApproved: false,
      deceptionProtocolApproved: false,
      debriefProtocolApproved: false,
      retentionProtocolApproved: false,
      ethicsReviewApproved: false
    })
    expect(() => authorizeProvenanceFlipStudy(protocol)).toThrow(/disabled|approval/i)
  })

  it('labels C2PA as provenance evidence rather than truth or trust', () => {
    const provenance = c2paProvenanceInputSchema.parse({
      schemaVersion: 'c2pa-provenance-input/v1',
      manifestId: 'urn:c2pa:example',
      signatureStatus: 'valid',
      assertions: ['Created with example tool.'],
      interpretationBoundary: 'Cryptographic provenance can bind assertions to an asset; it does not establish truth, trust, consent, or conscious authorship.'
    })
    expect(provenance.interpretationBoundary).toMatch(/does not establish truth/i)
  })
})
