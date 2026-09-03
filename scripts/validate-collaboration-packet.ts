import childProcess from 'node:child_process'
import dgram from 'node:dgram'
import dns from 'node:dns'
import dnsPromises from 'node:dns/promises'
import { lstat, readFile, readdir } from 'node:fs/promises'
import http from 'node:http'
import http2 from 'node:http2'
import net from 'node:net'
import { resolve } from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { stableStringify } from '../src/bench/artifact'
import {
  generateThreeVoiceReport,
  validateBlindReviewPacket,
  validateProvenanceEnvelope,
  validateReviewBundle,
  validateReviewContribution,
  type BlindReviewPacket,
  type ProvenanceEnvelope,
  type ReviewBundle,
  type ReviewCall,
  type ReviewContribution
} from '../src/bench/collaboration'
import { sha256Text } from '../src/bench/hash'
import { PORTABLE_COLLABORATION_FILES } from '../fixtures/collaboration/synthetic-collaboration'

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const canonicalFixtureDirectory = fileURLToPath(new URL('../fixtures/collaboration/', import.meta.url))

const manifestSchema = z.object({
  schemaVersion: z.literal('collaboration-conformance-kit/v1'),
  runId: z.string().uuid(),
  createdAt: z.string().datetime(),
  blinding: z.literal('partial'),
  researchBoundary: z.literal('tool-rehearsal-not-human-subject-research'),
  networkAccess: z.literal('disabled'),
  packet: z.literal('blind-review-packet.json'),
  envelope: z.literal('provenance-envelope.json'),
  lockedContributionPairs: z.tuple([
    z.object({
      locked: z.literal('reviewer-cedar.locked-first-call.json'),
      contribution: z.literal('reviewer-cedar.second-call-contribution.json')
    }),
    z.object({
      locked: z.literal('reviewer-lumen.locked-first-call.json'),
      contribution: z.literal('reviewer-lumen.second-call-contribution.json')
    })
  ]),
  bundle: z.literal('disagreement-bundle.json'),
  report: z.literal('three-voice-report.html'),
  reportTitle: z.string().min(1),
  proponentResponse: z.string().min(1),
  sourceBindingDigest: z.string().regex(/^[a-f0-9]{64}$/),
  receiptBindingDigest: z.string().regex(/^[a-f0-9]{64}$/),
  packetIntegrityDigest: z.string().regex(/^[a-f0-9]{64}$/),
  envelopeIntegrityDigest: z.string().regex(/^[a-f0-9]{64}$/),
  bundleIntegrityDigest: z.string().regex(/^[a-f0-9]{64}$/)
}).strict()

const prohibitedBlindKeys = new Set([
  'title',
  'author',
  'authors',
  'institution',
  'institutions',
  'affiliation',
  'affiliations',
  'doi',
  'theoryname',
  'provider',
  'model',
  'modelidentity',
  'prompt',
  'promptversion',
  'promptdigest',
  'pdf',
  'filename',
  'pdfpage',
  'page',
  'quote',
  'sourcequote',
  'rawsourcedigest',
  'sourcedigest',
  'papersha256',
  'textsha256',
  'sha256'
])

const prohibitedAggregationKeys = new Set([
  'score', 'scores', 'average', 'averages', 'mean', 'median', 'aggregate', 'aggregation',
  'consensus', 'rank', 'ranking', 'rankings', 'winner', 'winners', 'leaderboard', 'leaderboards'
])

function normalizedKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase()
}

function findProhibitedKey(value: unknown, prohibited: Set<string>, path = '$'): string | undefined {
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      const found = findProhibitedKey(child, prohibited, `${path}[${index}]`)
      if (found) return found
    }
    return undefined
  }
  if (!value || typeof value !== 'object') return undefined
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`
    if (prohibited.has(normalizedKey(key))) return childPath
    const found = findProhibitedKey(child, prohibited, childPath)
    if (found) return found
  }
  return undefined
}

function collectStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === 'string') output.push(value)
  else if (Array.isArray(value)) value.forEach(child => collectStrings(child, output))
  else if (value && typeof value === 'object') Object.values(value).forEach(child => collectStrings(child, output))
  return output
}

function provenanceValues(envelopeInput: unknown): string[] {
  if (!envelopeInput || typeof envelopeInput !== 'object') return []
  const envelope = envelopeInput as Record<string, unknown>
  const paper = envelope.paper && typeof envelope.paper === 'object'
    ? envelope.paper as Record<string, unknown>
    : {}
  const analysis = envelope.analysisIdentity && typeof envelope.analysisIdentity === 'object'
    ? envelope.analysisIdentity as Record<string, unknown>
    : {}
  const evidence = Array.isArray(envelope.evidence) ? envelope.evidence : []
  const candidates = [
    paper.fileName,
    paper.title,
    paper.authors,
    paper.author,
    paper.institution,
    paper.doi,
    paper.sha256,
    paper.textSha256,
    envelope.theoryName,
    analysis.provider,
    analysis.model,
    analysis.promptVersion,
    analysis.promptDigest,
    ...evidence.flatMap(item => {
      if (!item || typeof item !== 'object') return []
      const sources = (item as Record<string, unknown>).sources
      return Array.isArray(sources)
        ? sources.flatMap(source => {
            if (!source || typeof source !== 'object') return []
            const record = source as Record<string, unknown>
            return [record.citationId, record.quote]
          })
        : []
    })
  ]
  return [...new Set(collectStrings(candidates).filter(value => value.length >= 4))]
}

export function assertBlindPacketRedaction(rawPacket: unknown, envelopeInput?: unknown): void {
  const prohibitedPath = findProhibitedKey(rawPacket, prohibitedBlindKeys)
  if (prohibitedPath) {
    throw new Error('Blind packet contains a prohibited provenance field')
  }
  const normalizeValue = (value: string) => value.normalize('NFKC').trim().toLowerCase()
  const blindStrings = collectStrings(rawPacket).map(normalizeValue)
  const leakedValue = provenanceValues(envelopeInput).find(value => (
    blindStrings.some(candidate => candidate.includes(normalizeValue(value)))
  ))
  if (leakedValue) throw new Error('Blind packet contains a prohibited provenance value')
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  if (stableStringify(actual) !== stableStringify(expected)) throw new Error(message)
}

async function expectedSourceBinding(packet: BlindReviewPacket, envelope: ProvenanceEnvelope): Promise<string> {
  return sha256Text(stableStringify({
    paperSha256: envelope.paper.sha256,
    textSha256: envelope.paper.textSha256,
    benchmarkDigest: packet.benchmark.integrityDigest
  }))
}

async function validateEvidenceBindings(packet: BlindReviewPacket, envelope: ProvenanceEnvelope): Promise<void> {
  if (packet.commitments.length !== envelope.evidence.length) throw new Error('Claim and evidence count mismatch')
  for (const [index, commitment] of packet.commitments.entries()) {
    const revealed = envelope.evidence[index]
    if (!revealed || revealed.blindClaimId !== commitment.blindClaimId) {
      throw new Error('Claim and evidence order mismatch')
    }
    const expectedBlindClaimId = `blind:${index + 1}:${(await sha256Text(revealed.originalClaimId)).slice(0, 16)}`
    if (expectedBlindClaimId !== commitment.blindClaimId) throw new Error('Blind claim binding mismatch')
    const expectedDigests = await Promise.all(revealed.sources.map(source => sha256Text(stableStringify({
      originalClaimId: revealed.originalClaimId,
      citationId: source.citationId,
      pdfPage: source.pdfPage,
      quote: source.quote,
      sourceDigest: envelope.paper.sha256
    }))))
    assertEqual(
      commitment.evidenceBindings.map(binding => binding.evidenceDigest),
      expectedDigests,
      'Evidence digest mismatch'
    )
    assertEqual(revealed.sources.map(source => source.evidenceDigest), expectedDigests, 'Evidence digest mismatch')
  }
}

function expectedDelta(first: ReviewCall, second: ReviewCall) {
  return {
    blindClaimId: second.blindClaimId,
    changed: first.judgment !== second.judgment || first.confidence !== second.confidence,
    firstJudgment: first.judgment,
    secondJudgment: second.judgment,
    firstConfidence: first.confidence,
    secondConfidence: second.confidence,
    firstResponseTimeMs: first.responseTimeMs,
    secondResponseTimeMs: second.responseTimeMs,
    humanReason: second.reason
  }
}

function assertCanonicalCalls(packet: BlindReviewPacket, calls: ReviewCall[], message: string): void {
  const order = new Map(packet.commitments.map((commitment, index) => [commitment.blindClaimId, index]))
  const indexes = calls.map(call => order.get(call.blindClaimId))
  if (indexes.some(index => index === undefined)) throw new Error('Review call references an unknown blind claim')
  if (new Set(calls.map(call => call.blindClaimId)).size !== calls.length) throw new Error(message)
  if (indexes.some((index, position) => position > 0 && Number(index) <= Number(indexes[position - 1]))) {
    throw new Error('Review calls are not in canonical packet order')
  }
}

function assertRevealIntegrity(packet: BlindReviewPacket, contribution: ReviewContribution): void {
  const reveal = contribution.provenanceReveal
  if (!reveal) throw new Error('Second-call contribution is missing provenance reveal')
  assertCanonicalCalls(packet, contribution.blindLock.calls, 'Locked first calls contain duplicate claim IDs')
  assertCanonicalCalls(packet, reveal.secondCalls, 'Second calls contain duplicate claim IDs')
  const firstIds = contribution.blindLock.calls.map(call => call.blindClaimId)
  const secondIds = reveal.secondCalls.map(call => call.blindClaimId)
  assertEqual(secondIds, firstIds, 'Second calls must exactly match the locked first-call set')
  const firstByClaim = new Map(contribution.blindLock.calls.map(call => [call.blindClaimId, call]))
  const expectedDeltas = reveal.secondCalls.map(second => expectedDelta(firstByClaim.get(second.blindClaimId)!, second))
  assertEqual(reveal.deltas, expectedDeltas, 'Provenance delta mismatch')
}

function expectedDisagreements(packet: BlindReviewPacket, contributions: ReviewContribution[]) {
  return packet.commitments.flatMap(commitment => {
    const calls = contributions.flatMap(contribution => {
      const call = contribution.blindLock.calls.find(candidate => candidate.blindClaimId === commitment.blindClaimId)
      return call ? [{
        reviewerAlias: contribution.reviewerAlias,
        judgment: call.judgment,
        confidence: call.confidence,
        reason: call.reason
      }] : []
    })
    return calls.length ? [{ blindClaimId: commitment.blindClaimId, calls }] : []
  })
}

async function parseJson(contents: string, label: string): Promise<unknown> {
  try {
    return JSON.parse(contents)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

async function readPortableFiles(directory: string): Promise<Map<string, string>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const allowed = new Set<string>(PORTABLE_COLLABORATION_FILES)
  if (resolve(directory) === resolve(canonicalFixtureDirectory)) allowed.add('synthetic-collaboration.ts')
  const unexpected = entries.find(entry => !allowed.has(entry.name))
  if (unexpected) throw new Error(`Portable kit contains unexpected file: ${unexpected.name}`)
  const files = new Map<string, string>()
  let totalBytes = 0
  for (const fileName of PORTABLE_COLLABORATION_FILES) {
    const path = resolve(directory, fileName)
    let stats
    try {
      stats = await lstat(path)
    } catch {
      throw new Error(`Portable kit is missing required file: ${fileName}`)
    }
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`${fileName} must be a regular file, not a symlink`)
    if (stats.size > MAX_FILE_BYTES) throw new Error(`${fileName} exceeds the portable file size limit`)
    totalBytes += stats.size
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('Portable kit exceeds the total size limit')
    files.set(fileName, await readFile(path, 'utf8'))
  }
  return files
}

export interface CollaborationValidationResult {
  artifactCount: number
  contributionCount: number
  conflictingClaimCount: number
  networkAccess: 'disabled'
  packetIntegrityDigest: string
  bundleIntegrityDigest: string
}

async function validatePortableCollaborationKitCore(
  directory = canonicalFixtureDirectory
): Promise<CollaborationValidationResult> {
  const files = await readPortableFiles(directory)
  const manifest = manifestSchema.parse(await parseJson(files.get('manifest.json')!, 'manifest.json'))
  const rawPacket = await parseJson(files.get(manifest.packet)!, manifest.packet)
  const rawEnvelope = await parseJson(files.get(manifest.envelope)!, manifest.envelope)
  const rawBundle = await parseJson(files.get(manifest.bundle)!, manifest.bundle)
  assertBlindPacketRedaction(rawPacket, rawEnvelope)
  if (findProhibitedKey(rawBundle, prohibitedAggregationKeys)) {
    throw new Error('Bundle contains a prohibited aggregation field')
  }

  const packet = await validateBlindReviewPacket(rawPacket)
  const envelope = await validateProvenanceEnvelope(rawEnvelope)
  const bundle = await validateReviewBundle(rawBundle)
  const locked: ReviewContribution[] = []
  const contributions: ReviewContribution[] = []

  for (const pair of manifest.lockedContributionPairs) {
    const rawLocked = await parseJson(files.get(pair.locked)!, pair.locked)
    const rawContribution = await parseJson(files.get(pair.contribution)!, pair.contribution)
    if (findProhibitedKey(rawLocked, prohibitedAggregationKeys)
        || findProhibitedKey(rawContribution, prohibitedAggregationKeys)) {
      throw new Error('Contribution contains a prohibited aggregation field')
    }
    locked.push(await validateReviewContribution(rawLocked))
    contributions.push(await validateReviewContribution(rawContribution))
  }

  if (manifest.runId !== packet.packetId || envelope.envelopeId !== packet.packetId) throw new Error('Run ID mismatch')
  if (manifest.packetIntegrityDigest !== packet.integrityDigest || envelope.packetIntegrityDigest !== packet.integrityDigest) {
    throw new Error('Packet digest mismatch')
  }
  if (manifest.sourceBindingDigest !== packet.sourceBindingDigest
      || await expectedSourceBinding(packet, envelope) !== packet.sourceBindingDigest) {
    throw new Error('Source digest mismatch')
  }
  if (manifest.receiptBindingDigest !== packet.receiptBindingDigest) throw new Error('Receipt digest mismatch')
  if (manifest.envelopeIntegrityDigest !== envelope.integrityDigest) throw new Error('Envelope digest mismatch')
  if (manifest.bundleIntegrityDigest !== bundle.integrityDigest) throw new Error('Bundle digest mismatch')
  if (manifest.reportTitle !== envelope.theoryName) throw new Error('Report title does not match revealed theory')
  await validateEvidenceBindings(packet, envelope)

  const contributionIds = contributions.map(contribution => contribution.contributionId)
  const reviewerAliases = contributions.map(contribution => contribution.reviewerAlias)
  if (new Set(contributionIds).size !== contributionIds.length) throw new Error('Duplicate contributor ID')
  if (new Set(reviewerAliases).size !== reviewerAliases.length) throw new Error('Duplicate reviewer alias')
  if (contributionIds.some((id, index) => index > 0 && id <= contributionIds[index - 1])) {
    throw new Error('Contributions are not in canonical ID order')
  }

  for (const [index, contribution] of contributions.entries()) {
    const firstCallFile = locked[index]
    if (!firstCallFile) throw new Error('Locked first-call artifact is missing')
    if (firstCallFile.provenanceReveal) throw new Error('Locked first-call artifact contains a provenance reveal')
    if (firstCallFile.contributionId !== contribution.contributionId
        || firstCallFile.reviewerAlias !== contribution.reviewerAlias) {
      throw new Error('Locked first call does not match its contribution')
    }
    assertEqual(firstCallFile.blindLock, contribution.blindLock, 'Locked first call changed after its digest was created')
    if (contribution.packetIntegrityDigest !== packet.integrityDigest
        || firstCallFile.packetIntegrityDigest !== packet.integrityDigest) {
      throw new Error('Packet digest mismatch')
    }
    if (contribution.provenanceReveal?.envelopeIntegrityDigest !== envelope.integrityDigest) {
      throw new Error('Envelope digest mismatch')
    }
    assertRevealIntegrity(packet, contribution)
  }

  assertEqual(bundle.packet, packet, 'Bundle packet does not match the standalone blind packet')
  assertEqual(bundle.contributions, contributions, 'Bundle contributions do not match the standalone contributions')
  assertEqual(bundle.disagreements, expectedDisagreements(packet, contributions), 'Bundle disagreement projection mismatch')
  const conflictingClaimCount = bundle.disagreements.filter(disagreement => (
    new Set(disagreement.calls.map(call => call.judgment)).size > 1
  )).length
  if (conflictingClaimCount < 1) throw new Error('Bundle must preserve at least one conflicting reviewer judgment')

  const report = files.get(manifest.report)!
  const expectedReport = `${generateThreeVoiceReport(packet, bundle, manifest.proponentResponse, manifest.reportTitle)}\n`
  if (report !== expectedReport) throw new Error('Three-voice report bytes do not match the sealed artifacts')
  if (/<script\b/i.test(report)) throw new Error('Three-voice report must not contain script')
  for (const heading of [
    '1. Neutral bench record',
    '2. Theory proponent response',
    '3. Independent reviewer interpretation'
  ]) {
    if (!report.includes(heading)) throw new Error(`Three-voice report is missing section: ${heading}`)
  }

  return {
    artifactCount: PORTABLE_COLLABORATION_FILES.length - 1,
    contributionCount: contributions.length,
    conflictingClaimCount,
    networkAccess: 'disabled',
    packetIntegrityDigest: packet.integrityDigest,
    bundleIntegrityDigest: bundle.integrityDigest
  }
}

type MutableTarget = Record<string, unknown>
let networkGuardTail: Promise<void> = Promise.resolve()

async function runWithNetworkDisabled<T>(operation: () => Promise<T>): Promise<T> {
  const restorations: Array<() => void> = []
  const block = (target: MutableTarget, key: string, asynchronous = false) => {
    const descriptor = Object.getOwnPropertyDescriptor(target, key)
    const blocked = asynchronous
      ? async () => { throw new Error('Network access is disabled for the portable collaboration rehearsal') }
      : () => { throw new Error('Network access is disabled for the portable collaboration rehearsal') }
    Object.defineProperty(target, key, {
      configurable: descriptor?.configurable ?? true,
      enumerable: descriptor?.enumerable ?? true,
      writable: true,
      value: blocked
    })
    restorations.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor)
      else delete target[key]
    })
  }
  let result: T | undefined
  let operationFailure: unknown
  try {
    block(globalThis as unknown as MutableTarget, 'fetch', true)
    block(net.Socket.prototype as unknown as MutableTarget, 'connect')
    block(tls.TLSSocket.prototype as unknown as MutableTarget, 'connect')
    block(dgram.Socket.prototype as unknown as MutableTarget, 'connect')
    block(dgram.Socket.prototype as unknown as MutableTarget, 'send')
    block(http.ClientRequest.prototype as unknown as MutableTarget, 'end')
    for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) block(dns as unknown as MutableTarget, key)
    for (const key of ['lookup', 'resolve', 'resolve4', 'resolve6', 'reverse']) block(dnsPromises as unknown as MutableTarget, key)
    block(http2 as unknown as MutableTarget, 'connect')
    for (const key of ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync']) {
      block(childProcess as unknown as MutableTarget, key)
    }
    result = await operation()
  } catch (error) {
    operationFailure = error
  }

  let restorationFailure = false
  for (const restore of restorations.reverse()) {
    try {
      restore()
    } catch {
      restorationFailure = true
    }
  }
  if (operationFailure) throw operationFailure
  if (restorationFailure) throw new Error('Network guard state could not be restored safely')
  return result as T
}

export function withNetworkDisabled<T>(operation: () => Promise<T>): Promise<T> {
  const guarded = networkGuardTail.then(() => runWithNetworkDisabled(operation))
  networkGuardTail = guarded.then(() => undefined, () => undefined)
  return guarded
}

export function validatePortableCollaborationKit(
  directory = canonicalFixtureDirectory
): Promise<CollaborationValidationResult> {
  return withNetworkDisabled(() => validatePortableCollaborationKitCore(directory))
}

export function sanitizeCliMessage(message: string): string {
  return message
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/g, ' ')
    .slice(0, 240)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await validatePortableCollaborationKit(process.argv[2])
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown validation failure'
    process.stderr.write(`Collaboration validation failed: ${sanitizeCliMessage(message)}\n`)
    process.exitCode = 1
  }
}
