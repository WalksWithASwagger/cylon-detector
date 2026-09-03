import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createBlindReviewPacket,
  createProvenanceEnvelope,
  generateThreeVoiceReport,
  lockBlindContribution,
  mergeReviewContributions,
  revealContribution,
  type ReviewCall
} from '../../src/bench/collaboration'
import { normalizeEvaluationRun, type EvaluationRunV2 } from '../../src/bench/v2/artifact'

export const PORTABLE_COLLABORATION_FILES = [
  'manifest.json',
  'blind-review-packet.json',
  'provenance-envelope.json',
  'reviewer-cedar.locked-first-call.json',
  'reviewer-cedar.second-call-contribution.json',
  'reviewer-lumen.locked-first-call.json',
  'reviewer-lumen.second-call-contribution.json',
  'disagreement-bundle.json',
  'three-voice-report.html'
] as const

export type PortableCollaborationFile = typeof PORTABLE_COLLABORATION_FILES[number]

const proponentResponse = 'Synthetic proponent response: the relay claim is intentionally narrow and remains open to the documented dissent.'

function json(value: unknown): string {
  return `${JSON.stringify(value)}\n`
}

export async function createSyntheticCollaborationFixtures(
  run: EvaluationRunV2
): Promise<Record<PortableCollaborationFile, string>> {
  const packet = await createBlindReviewPacket(run, 'Theory Juniper', run.createdAt)
  const envelope = await createProvenanceEnvelope(run, packet, run.createdAt)
  const blindClaimId = packet.commitments[0].blindClaimId
  const cedarFirstCall: ReviewCall = {
    blindClaimId,
    judgment: 'supported',
    confidence: 'low',
    responseTimeMs: 3100,
    reason: 'The synthetic commitment states an observable sequence.'
  }
  const lumenFirstCall: ReviewCall = {
    blindClaimId,
    judgment: 'unsupported',
    confidence: 'high',
    responseTimeMs: 4700,
    reason: 'The synthetic commitment does not rule out a relay-only alternative.'
  }
  const cedarLocked = await lockBlindContribution(
    packet,
    'Reviewer Cedar',
    [cedarFirstCall],
    '2030-01-02T03:05:00.000Z',
    '30000000-0000-4000-8000-000000000001'
  )
  const lumenLocked = await lockBlindContribution(
    packet,
    'Reviewer Lumen',
    [lumenFirstCall],
    '2030-01-02T03:05:30.000Z',
    '30000000-0000-4000-8000-000000000002'
  )
  const cedarContribution = await revealContribution(cedarLocked, envelope, [{
    ...cedarFirstCall,
    confidence: 'medium',
    responseTimeMs: 1600,
    reason: 'The revealed synthetic source supports the sequence but not its exclusivity.'
  }], '2030-01-02T03:06:00.000Z')
  const lumenContribution = await revealContribution(lumenLocked, envelope, [{
    ...lumenFirstCall,
    judgment: 'insufficient_evidence',
    responseTimeMs: 1900,
    reason: 'The revealed synthetic source still leaves the alternative unresolved.'
  }], '2030-01-02T03:06:30.000Z')
  const bundle = await mergeReviewContributions(
    packet,
    [cedarContribution, lumenContribution],
    '2030-01-02T03:07:00.000Z',
    '40000000-0000-4000-8000-000000000001'
  )
  const report = generateThreeVoiceReport(packet, bundle, proponentResponse, envelope.theoryName)
  const manifest = {
    schemaVersion: 'collaboration-conformance-kit/v1',
    runId: run.runId,
    createdAt: '2030-01-02T03:07:00.000Z',
    blinding: 'partial',
    researchBoundary: 'tool-rehearsal-not-human-subject-research',
    networkAccess: 'disabled',
    packet: 'blind-review-packet.json',
    envelope: 'provenance-envelope.json',
    lockedContributionPairs: [
      {
        locked: 'reviewer-cedar.locked-first-call.json',
        contribution: 'reviewer-cedar.second-call-contribution.json'
      },
      {
        locked: 'reviewer-lumen.locked-first-call.json',
        contribution: 'reviewer-lumen.second-call-contribution.json'
      }
    ],
    bundle: 'disagreement-bundle.json',
    report: 'three-voice-report.html',
    reportTitle: envelope.theoryName,
    proponentResponse,
    sourceBindingDigest: packet.sourceBindingDigest,
    receiptBindingDigest: packet.receiptBindingDigest,
    packetIntegrityDigest: packet.integrityDigest,
    envelopeIntegrityDigest: envelope.integrityDigest,
    bundleIntegrityDigest: bundle.integrityDigest
  }

  return {
    'manifest.json': json(manifest),
    'blind-review-packet.json': json(packet),
    'provenance-envelope.json': json(envelope),
    'reviewer-cedar.locked-first-call.json': json(cedarLocked),
    'reviewer-cedar.second-call-contribution.json': json(cedarContribution),
    'reviewer-lumen.locked-first-call.json': json(lumenLocked),
    'reviewer-lumen.second-call-contribution.json': json(lumenContribution),
    'disagreement-bundle.json': json(bundle),
    'three-voice-report.html': `${report}\n`
  }
}

export async function writeSyntheticCollaborationFixtures(
  directory = dirname(fileURLToPath(import.meta.url))
): Promise<void> {
  const receiptPath = fileURLToPath(new URL('../conformance/synthetic-receipt.v2.json', import.meta.url))
  const run = await normalizeEvaluationRun(JSON.parse(await readFile(receiptPath, 'utf8')))
  const files = await createSyntheticCollaborationFixtures(run)
  await mkdir(directory, { recursive: true })
  await Promise.all(Object.entries(files).map(([fileName, contents]) => (
    writeFile(resolve(directory, fileName), contents, 'utf8')
  )))
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeSyntheticCollaborationFixtures(process.argv[2])
}
