import rawIndicatorBundle from '../../indicators/templates/minimal-witness/0.1.0-draft.json'
import {
  authorizeLiveSystemTest,
  buildEvidenceProfile,
  c2paProvenanceInputSchema,
  indicatorBundleSchema,
  provenanceFlipStudyProtocolSchema
} from './experiments'

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing #${id}`)
  return value as T
}

function download(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function lines(id: string): string[] {
  return element<HTMLTextAreaElement>(id).value.split('\n').map(value => value.trim()).filter(Boolean)
}

export function mountExperimentsWorkspace(showToast: (message: string, tone?: 'normal' | 'error') => void) {
  const status = element<HTMLElement>('experimental-status')
  const indicatorBundle = indicatorBundleSchema.parse(rawIndicatorBundle)

  element<HTMLButtonElement>('export-indicator-template').addEventListener('click', () => {
    download('cylon-detector_minimal-witness-indicators_0.1.0-draft.json', indicatorBundle)
    status.textContent = 'INDICATOR TEMPLATE EXPORTED / FIVE EVIDENCE LANES KEPT SEPARATE'
  })

  element<HTMLButtonElement>('export-empty-evidence-profile').addEventListener('click', () => void (async () => {
    const profile = await buildEvidenceProfile(indicatorBundle, indicatorBundle.indicators.map(indicator => ({
      indicatorId: indicator.id,
      lane: indicator.lane,
      observations: [],
      counterevidence: indicator.counterevidence,
      uncertainty: 'high' as const,
      theoryDependence: `Evidence is interpretable only under ${indicatorBundle.theory.name}.`
    })))
    download(`cylon-detector_${profile.profileId}_evidence-profile.json`, profile)
    status.textContent = 'HIGH-UNCERTAINTY PROFILE EXPORTED / NO BINARY CONCLUSION'
  })())

  element<HTMLButtonElement>('export-ethics-session').addEventListener('click', () => {
    try {
      const session = authorizeLiveSystemTest({
        schemaVersion: 'ai-system-test-ethics-gate/v1',
        purpose: element<HTMLTextAreaElement>('ethics-purpose').value.trim(),
        systemUnderTest: element<HTMLInputElement>('ethics-system').value.trim(),
        namedHumanOwner: element<HTMLInputElement>('ethics-owner').value.trim(),
        interventionRisk: element<HTMLSelectElement>('ethics-risk').value,
        interventions: lines('ethics-interventions'),
        welfareRisks: lines('ethics-welfare'),
        stopConditions: lines('ethics-stop'),
        dataHandling: element<HTMLTextAreaElement>('ethics-data').value.trim(),
        publicationPlan: element<HTMLTextAreaElement>('ethics-publication').value.trim(),
        ownerApprovedAt: new Date().toISOString(),
        ethicsReview: element<HTMLSelectElement>('ethics-review').value
      })
      download(`cylon-detector_${session.sessionId}_ai-test-authorization.json`, session)
      status.textContent = 'WELFARE GATE AUTHORIZATION EXPORTED / NO INTERVENTION EXECUTED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Ethics gate failed', 'error') }
  })

  element<HTMLButtonElement>('export-disabled-provenance-study').addEventListener('click', () => {
    const protocol = provenanceFlipStudyProtocolSchema.parse({
      schemaVersion: 'provenance-flip-study-protocol/v1',
      enabled: false,
      collectionState: 'disabled',
      purpose: 'Test provenance-induced aesthetic reversal only after a real human-subject protocol is approved.',
      consentProtocolApproved: false,
      deceptionProtocolApproved: false,
      debriefProtocolApproved: false,
      retentionProtocolApproved: false,
      ethicsReviewApproved: false
    })
    download('cylon-detector_provenance-flip-study_DISABLED.json', protocol)
    status.textContent = 'DISABLED PROVENANCE FLIP PROTOCOL EXPORTED / NO HUMAN DATA COLLECTION'
  })

  element<HTMLButtonElement>('export-c2pa-input').addEventListener('click', () => {
    try {
      const input = JSON.parse(element<HTMLTextAreaElement>('c2pa-input').value) as Record<string, unknown>
      const provenance = c2paProvenanceInputSchema.parse({
        schemaVersion: 'c2pa-provenance-input/v1',
        manifestId: input.manifestId,
        signatureStatus: input.signatureStatus,
        assertions: input.assertions,
        interpretationBoundary: 'Cryptographic provenance can bind assertions to an asset; it does not establish truth, trust, consent, or conscious authorship.'
      })
      download('cylon-detector_c2pa-provenance-input.json', provenance)
      status.textContent = 'C2PA INPUT EXPORTED / PROVENANCE KEPT SEPARATE FROM TRUTH AND TRUST'
    } catch (error) { showToast(error instanceof Error ? error.message : 'C2PA input failed', 'error') }
  })
}
