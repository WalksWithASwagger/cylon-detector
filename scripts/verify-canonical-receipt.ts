import {
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  writeFile
} from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import rawLegacyBenchmark from '../benchmarks/mac-lab-001/0.1.0-alpha.1.json'
import {
  evaluationRunSchema,
  stableStringify,
  validateEvaluationRunArtifact
} from '../src/bench/artifact'
import { sha256Text } from '../src/bench/hash'
import { benchmarkDefinitionSchema, verdictSchema } from '../src/bench/schema'
import {
  normalizeEvaluationRun,
  validateEvaluationRunV2,
  type EvaluationRunV2
} from '../src/bench/v2/artifact'
import { demandKeyV2Schema } from '../src/bench/v2/contracts'
import { defaultBenchmarkRegistry } from '../src/bench/v2/defaultRegistry'
import { generateReportBundle, type ReportBundle } from '../src/bench/v2/reports'
import { resolveBenchmark } from '../src/bench/v2/registry'

export const CONFORMANCE_OUTPUT_FILES = [
  'canonical-receipt.v2.json',
  'lab-note.html',
  'methods-and-evidence.html',
  'claim-ledger.csv',
  'claim-ledger.json',
  'stress-fracture-map.json',
  'witness-protocols.json',
  'conformance-manifest.json'
] as const

export const MAX_RECEIPT_INPUT_BYTES = 2 * 1024 * 1024

const SYNTHETIC_LEGACY_BENCHMARK_DIGEST = '4df227118712dfa6bd9c1ca6337c07bc4ef5f757f10e916d834dc36b636f68d6'

type OutputFileName = typeof CONFORMANCE_OUTPUT_FILES[number]

export type ReceiptConformanceErrorCode =
  | 'INPUT_INVALID'
  | 'INPUT_TOO_LARGE'
  | 'RECEIPT_INTEGRITY'
  | 'REVIEW_HISTORY'
  | 'BENCHMARK_MISMATCH'
  | 'CITATION_EVIDENCE'
  | 'LEDGER_BINDING'
  | 'VERDICT_BINDING'
  | 'LEDGER_PARITY'
  | 'SEALED_PROSE'
  | 'OUTPUT_CONFLICT'
  | 'OUTPUT_PUBLICATION'

export class ReceiptConformanceError extends Error {
  readonly code: ReceiptConformanceErrorCode

  constructor(
    code: ReceiptConformanceErrorCode,
    message: string,
    cause?: unknown
  ) {
    super(`${code}: ${message}`)
    this.name = 'ReceiptConformanceError'
    this.code = code
    if (cause !== undefined) Object.assign(this, { cause })
  }
}

export interface ConformanceManifest {
  schemaVersion: 'cylon-receipt-conformance/v1'
  originalSchemaVersion: 'mac-evaluation-run/v1' | 'mac-evaluation-run/v2'
  exportedSchemaVersion: 'mac-evaluation-run/v2'
  receiptIntegrityDigest: string
  benchmarkIntegrityDigest: string
  outputs: Record<string, string>
}

function record(input: unknown, label: string): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ReceiptConformanceError('INPUT_INVALID', `${label} must be an object.`)
  }
  return input as Record<string, unknown>
}

function terminalValue(value: string, maximumLength = 120): string {
  const encoded = JSON.stringify(value).slice(1, -1).replace(
    /[\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g,
    character => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  )
  return encoded.length <= maximumLength
    ? encoded
    : `${encoded.slice(0, maximumLength - 3)}...`
}

export function parseReceiptInput(serialized: string): unknown {
  try {
    return JSON.parse(serialized) as unknown
  } catch (error) {
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt input is not valid JSON.', error)
  }
}

function isFileSystemError(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code
}

function originalSchemaVersion(input: unknown): ConformanceManifest['originalSchemaVersion'] {
  const version = record(input, 'Receipt').schemaVersion
  if (version !== 'mac-evaluation-run/v1' && version !== 'mac-evaluation-run/v2') {
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt schemaVersion must be mac-evaluation-run/v1 or mac-evaluation-run/v2.')
  }
  return version
}

export async function readReceiptInputFile(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const metadata = await handle.stat()
    if (!metadata.isFile()) {
      throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt input must be a regular file.')
    }
    if (metadata.size > MAX_RECEIPT_INPUT_BYTES) {
      throw new ReceiptConformanceError(
        'INPUT_TOO_LARGE',
        `Receipt input exceeds the ${MAX_RECEIPT_INPUT_BYTES}-byte CLI limit.`
      )
    }

    const chunks: Buffer[] = []
    const buffer = Buffer.alloc(64 * 1024)
    let total = 0
    while (total <= MAX_RECEIPT_INPUT_BYTES) {
      const remaining = MAX_RECEIPT_INPUT_BYTES + 1 - total
      const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, remaining), total)
      if (bytesRead === 0) break
      chunks.push(Buffer.from(buffer.subarray(0, bytesRead)))
      total += bytesRead
      if (total > MAX_RECEIPT_INPUT_BYTES) {
        throw new ReceiptConformanceError(
          'INPUT_TOO_LARGE',
          `Receipt input exceeds the ${MAX_RECEIPT_INPUT_BYTES}-byte CLI limit.`
        )
      }
    }
    return Buffer.concat(chunks, total).toString('utf8')
  } finally {
    await handle.close()
  }
}

async function assertAllowedLegacyBenchmark(input: unknown): Promise<void> {
  let run
  try {
    run = await validateEvaluationRunArtifact(evaluationRunSchema.parse(input))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/artifact digest|digest does not match/i.test(message)) {
      throw new ReceiptConformanceError(
        'RECEIPT_INTEGRITY',
        'Legacy receipt integrity digest does not match; no outputs were written.',
        error
      )
    }
    throw new ReceiptConformanceError('INPUT_INVALID', 'Legacy receipt failed canonical schema validation.', error)
  }

  const benchmarkDigest = await sha256Text(stableStringify(run.benchmark))
  if (benchmarkDigest !== run.benchmarkDigest) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Legacy benchmark digest does not match its digest-bound definition.'
    )
  }

  const canonicalLegacyBenchmark = benchmarkDefinitionSchema.parse(rawLegacyBenchmark)
  const canonicalLegacyDigest = await sha256Text(stableStringify(canonicalLegacyBenchmark))
  if (benchmarkDigest !== canonicalLegacyDigest && benchmarkDigest !== SYNTHETIC_LEGACY_BENCHMARK_DIGEST) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Legacy benchmark has no explicit mapping to the canonical v2 registry.'
    )
  }
}

function assertReviewHistoryOrder(input: unknown): void {
  const receipt = record(input, 'Receipt')
  if (receipt.schemaVersion !== 'mac-evaluation-run/v2') return
  if (!Array.isArray(receipt.reviewEvents)) {
    throw new ReceiptConformanceError('REVIEW_HISTORY', 'reviewEvents must be an array.')
  }

  const eventIds = new Set<string>()
  receipt.reviewEvents.forEach((candidate, index) => {
    const event = record(candidate, `reviewEvents[${index}]`)
    if (event.sequence !== index + 1) {
      throw new ReceiptConformanceError(
        'REVIEW_HISTORY',
        `Review event sequence is invalid at array position ${index + 1}; expected sequence ${index + 1}.`
      )
    }
    if (typeof event.eventId !== 'string' || eventIds.has(event.eventId)) {
      throw new ReceiptConformanceError('REVIEW_HISTORY', `Review event ID is missing or duplicated at sequence ${index + 1}.`)
    }
    eventIds.add(event.eventId)
  })
}

async function normalizeAndVerify(input: unknown): Promise<EvaluationRunV2> {
  try {
    const normalized = await normalizeEvaluationRun(input)
    return await validateEvaluationRunV2(normalized)
  } catch (error) {
    if (error instanceof ReceiptConformanceError) throw error
    const message = error instanceof Error ? error.message : String(error)
    if (/integrity digest|artifact digest|digest does not match/i.test(message)) {
      throw new ReceiptConformanceError(
        'RECEIPT_INTEGRITY',
        'Receipt integrity digest does not match; no outputs were written.',
        error
      )
    }
    throw new ReceiptConformanceError('INPUT_INVALID', 'Receipt failed canonical schema validation; no outputs were written.', error)
  }
}

async function assertCanonicalBenchmark(run: EvaluationRunV2): Promise<void> {
  try {
    const canonical = await resolveBenchmark(defaultBenchmarkRegistry, {
      id: run.benchmark.definition.id,
      version: run.benchmark.definition.version,
      integrityDigest: run.benchmark.definition.integrityDigest
    })
    if (stableStringify(run.benchmark.definition) !== stableStringify(canonical.benchmark)) {
      throw new Error('Benchmark definition snapshot differs from the canonical registry')
    }
    if (stableStringify(run.benchmark.challenges) !== stableStringify(canonical.challenges)) {
      throw new Error('Challenge snapshots differ from the canonical registry')
    }
  } catch (error) {
    throw new ReceiptConformanceError(
      'BENCHMARK_MISMATCH',
      'Receipt benchmark definition or challenge snapshot does not match the canonical registry; no outputs were written.',
      error
    )
  }
}

function assertCitationEvidence(run: EvaluationRunV2): void {
  const verified = new Map<string, EvaluationRunV2['verifiedCitations'][number]>()
  for (const citation of run.verifiedCitations) {
    if (verified.has(citation.id)) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Verified citation ID ${terminalValue(citation.id)} is duplicated.`
      )
    }
    verified.set(citation.id, citation)
  }

  const assertDraftCitation = (
    draft: EvaluationRunV2['aiDraft']['theory']['centralClaims'][number]['citations'][number],
    expectedField: string
  ) => {
    const citation = verified.get(draft.id)
    const safeId = terminalValue(draft.id)
    if (!citation) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} is missing from verifiedCitations.`
      )
    }
    if (citation.verification !== 'exact' && citation.verification !== 'normalized') {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} has failed verification status ${citation.verification}.`
      )
    }
    if (
      draft.quote !== citation.quote ||
      draft.pdfPage !== citation.pdfPage ||
      draft.printedPageLabel !== citation.printedPageLabel ||
      draft.supportsField !== citation.supportsField ||
      draft.supportsField !== expectedField
    ) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} does not match the verified record and field coordinate ${terminalValue(expectedField)}.`
      )
    }
  }

  for (const claim of run.aiDraft.theory.centralClaims) {
    for (const citation of claim.citations) assertDraftCitation(citation, 'theory.centralClaims')
  }
  for (const challenge of run.aiDraft.challenges) {
    for (const demand of demandKeyV2Schema.options) {
      for (const citation of challenge[demand].citations) {
        assertDraftCitation(citation, `challenges.${challenge.challengeId}.${demand}`)
      }
    }
  }

  for (const row of run.claimLedger) {
    for (const source of row.sourceQuotes) {
      const citation = verified.get(source.citationId)
      const safeId = terminalValue(source.citationId)
      if (!citation) {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim Ledger source ${safeId} is missing from verifiedCitations.`
        )
      }
      if (citation.verification !== 'exact' && citation.verification !== 'normalized') {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim Ledger source ${safeId} has failed verification status ${citation.verification}.`
        )
      }
      if (
        source.verification !== citation.verification ||
        source.quote !== citation.quote ||
        source.pdfPage !== citation.pdfPage ||
        source.printedPageLabel !== citation.printedPageLabel
      ) {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim ${terminalValue(row.claimId)} source ${safeId} does not match its verified citation record.`
        )
      }
    }
  }
}

function eventFinalCall(event: EvaluationRunV2['reviewEvents'][number]) {
  return {
    decision: event.decision,
    ...(event.decision === 'accepted' ? { value: event.modelValue } : {}),
    ...(event.decision === 'revised' && event.humanValue ? { value: event.humanValue } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    eventId: event.eventId
  }
}

function assertClaimLedgerBindings(run: EvaluationRunV2): void {
  const challengeVersions = new Map(run.benchmark.challenges.map(challenge => [challenge.id, challenge.version]))
  const rows = new Map<string, EvaluationRunV2['claimLedger'][number]>()
  for (const row of run.claimLedger) {
    if (rows.has(row.claimId)) {
      throw new ReceiptConformanceError('LEDGER_BINDING', `Claim ID ${terminalValue(row.claimId)} is duplicated.`)
    }
    rows.set(row.claimId, row)
  }

  const expectedClaimIds = new Set<string>()
  const permittedEventClaimIds = new Set<string>()
  for (const challenge of run.aiDraft.challenges) {
    const challengeVersion = challengeVersions.get(challenge.challengeId)
    if (!challengeVersion) {
      throw new ReceiptConformanceError(
        'LEDGER_BINDING',
        `AI draft challenge ${terminalValue(challenge.challengeId)} is absent from the benchmark snapshot.`
      )
    }
    permittedEventClaimIds.add(`verdict:${run.runId}:${challenge.challengeId}`)
    for (const demand of demandKeyV2Schema.options) {
      const expectedClaimId = `claim:${run.runId}:${challenge.challengeId}:${demand}`
      expectedClaimIds.add(expectedClaimId)
      permittedEventClaimIds.add(expectedClaimId)
      const row = rows.get(expectedClaimId)
      if (!row) {
        throw new ReceiptConformanceError('LEDGER_BINDING', `Expected claim ${terminalValue(expectedClaimId)} is missing.`)
      }
      if (
        row.challenge.id !== challenge.challengeId ||
        row.challenge.version !== challengeVersion ||
        row.demand !== demand ||
        row.modelDraft !== challenge[demand].text
      ) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} contradicts its benchmark or AI draft coordinate.`
        )
      }

      const draftCitationIds = challenge[demand].citations.map(citation => citation.id)
      const ledgerCitationIds = row.sourceQuotes.map(citation => citation.citationId)
      if (stableStringify(draftCitationIds) !== stableStringify(ledgerCitationIds)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} does not retain its complete ordered citation list.`
        )
      }

      const matchingEvents = run.reviewEvents.filter(event => event.claimId === expectedClaimId)
      const matchingEventIds = matchingEvents.map(event => event.eventId)
      if (stableStringify(row.humanEventIds) !== stableStringify(matchingEventIds)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} does not retain its complete ordered review-event history.`
        )
      }
      if (matchingEvents.some(event => event.modelValue !== row.modelDraft)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} review event does not retain the sealed model draft.`
        )
      }
      const latestEvent = matchingEvents.at(-1)
      const expectedFinalCall = latestEvent ? eventFinalCall(latestEvent) : undefined
      if (stableStringify(row.finalCall) !== stableStringify(expectedFinalCall)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} final call does not match its latest review event.`
        )
      }
    }
  }

  if (rows.size !== expectedClaimIds.size || [...rows.keys()].some(claimId => !expectedClaimIds.has(claimId))) {
    throw new ReceiptConformanceError('LEDGER_BINDING', 'Claim Ledger contains an unexpected or contradictory claim coordinate.')
  }
  const unexpectedEvent = run.reviewEvents.find(event => !permittedEventClaimIds.has(event.claimId))
  if (unexpectedEvent) {
    throw new ReceiptConformanceError(
      'LEDGER_BINDING',
      `Review event ${terminalValue(unexpectedEvent.eventId)} targets unexpected claim ${terminalValue(unexpectedEvent.claimId)}.`
    )
  }
}

function assertStressFractureBindings(run: EvaluationRunV2): void {
  const fractures = new Map<string, EvaluationRunV2['stressFractureMap'][number]>()
  for (const fracture of run.stressFractureMap) {
    if (fractures.has(fracture.challengeId)) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture challenge ${terminalValue(fracture.challengeId)} is duplicated.`
      )
    }
    fractures.set(fracture.challengeId, fracture)
  }

  for (const challenge of run.aiDraft.challenges) {
    const fracture = fractures.get(challenge.challengeId)
    const safeChallengeId = terminalValue(challenge.challengeId)
    if (!fracture) {
      throw new ReceiptConformanceError('VERDICT_BINDING', `Stress Fracture ${safeChallengeId} is missing.`)
    }
    if (fracture.modelVerdict !== challenge.proposedVerdict) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} model verdict contradicts the sealed AI draft.`
      )
    }

    const verdictClaimId = `verdict:${run.runId}:${challenge.challengeId}`
    const verdictEvents = run.reviewEvents.filter(event => event.claimId === verdictClaimId)
    if (verdictEvents.some(event => event.modelValue !== challenge.proposedVerdict)) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} verdict stream does not retain the sealed model verdict.`
      )
    }
    const latestEvent = verdictEvents.at(-1)
    if (!latestEvent) {
      if (fracture.humanDecision || fracture.humanVerdict || fracture.rationale) {
        throw new ReceiptConformanceError(
          'VERDICT_BINDING',
          `Stress Fracture ${safeChallengeId} has a human call without a verdict event stream.`
        )
      }
      continue
    }

    const humanVerdict = latestEvent.decision === 'accepted'
      ? verdictSchema.safeParse(latestEvent.modelValue)
      : latestEvent.decision === 'revised'
        ? verdictSchema.safeParse(latestEvent.humanValue)
        : verdictSchema.safeParse('insufficient_evidence')
    if (!humanVerdict.success) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} latest verdict event has an invalid categorical value.`
      )
    }
    if (
      fracture.humanDecision !== latestEvent.decision ||
      fracture.humanVerdict !== humanVerdict.data ||
      fracture.rationale !== latestEvent.reason
    ) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} does not match the latest event in its complete ordered verdict stream.`
      )
    }
  }

  if (fractures.size !== run.aiDraft.challenges.length) {
    throw new ReceiptConformanceError('VERDICT_BINDING', 'Stress Fracture Map contains an unexpected challenge coordinate.')
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character)
}

function requireProse(output: string, prose: string, label: string): void {
  if (!output.includes(escapeHtml(prose))) {
    throw new ReceiptConformanceError('SEALED_PROSE', `${label} is absent from the generated report bytes.`)
  }
}

export function assertSealedProseReuse(run: EvaluationRunV2, bundle: ReportBundle): void {
  requireProse(bundle.labNoteHtml, run.summary, 'Sealed summary in Lab Note')
  requireProse(bundle.methodsHtml, run.summary, 'Sealed summary in Methods report')
  for (const row of run.claimLedger) {
    const safeClaimId = terminalValue(row.claimId)
    requireProse(bundle.methodsHtml, row.modelDraft, `Sealed model draft for ${safeClaimId}`)
    if (row.finalCall?.value) requireProse(bundle.methodsHtml, row.finalCall.value, `Sealed human value for ${safeClaimId}`)
    if (row.finalCall?.reason) requireProse(bundle.methodsHtml, row.finalCall.reason, `Sealed human reason for ${safeClaimId}`)
  }
  for (const fracture of run.stressFractureMap) {
    if (fracture.rationale) requireProse(bundle.labNoteHtml, fracture.rationale, `Sealed stress rationale for ${fracture.challengeId}`)
  }
  for (const protocol of run.witnessProtocols) {
    requireProse(bundle.labNoteHtml, protocol.prediction, `Sealed witness prediction for ${protocol.challengeId}`)
  }
}

function parseClaimLedgerCsvIds(csv: string): string[] {
  try {
    return csv.trim().split('\n').slice(1).map(line => {
      const row = JSON.parse(`[${line}]`) as unknown[]
      if (typeof row[0] !== 'string') throw new Error('claimId cell is not a string')
      return row[0]
    })
  } catch (error) {
    throw new ReceiptConformanceError('LEDGER_PARITY', 'Claim Ledger CSV is not parseable as canonical JSON-quoted cells.', error)
  }
}

function assertClaimLedgerParity(run: EvaluationRunV2, bundle: ReportBundle): void {
  let jsonIds: string[]
  try {
    const rows = JSON.parse(bundle.claimLedgerJson) as Array<{ claimId?: unknown }>
    jsonIds = rows.map(row => {
      if (typeof row.claimId !== 'string') throw new Error('claimId is not a string')
      return row.claimId
    })
  } catch (error) {
    throw new ReceiptConformanceError('LEDGER_PARITY', 'Claim Ledger JSON is not parseable.', error)
  }
  const csvIds = parseClaimLedgerCsvIds(bundle.claimLedgerCsv)
  const receiptIds = run.claimLedger.map(row => row.claimId)
  if (
    stableStringify(csvIds) !== stableStringify(jsonIds) ||
    stableStringify(jsonIds) !== stableStringify(receiptIds) ||
    new Set(jsonIds).size !== jsonIds.length
  ) {
    throw new ReceiptConformanceError('LEDGER_PARITY', 'Claim Ledger CSV, JSON, and receipt row IDs are not in stable one-to-one parity.')
  }
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function assertDestinationAbsent(destination: string): Promise<void> {
  try {
    await lstat(destination)
    throw new ReceiptConformanceError(
      'OUTPUT_CONFLICT',
      `Output destination ${terminalValue(destination)} already exists; caller data was not changed.`
    )
  } catch (error) {
    if (error instanceof ReceiptConformanceError) throw error
    if (isFileSystemError(error, 'ENOENT')) return
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      `Output destination ${terminalValue(destination)} could not be inspected; caller data was not changed.`,
      error
    )
  }
}

interface PublicationTarget {
  destination: string
}

interface DirectoryIdentity {
  device: bigint
  inode: bigint
}

async function resolvePublicationTarget(destinationInput: string): Promise<PublicationTarget> {
  const lexicalDestination = resolve(destinationInput)
  const lexicalParent = dirname(lexicalDestination)
  let stableParent: string
  try {
    stableParent = await realpath(lexicalParent)
    if (!(await stat(stableParent)).isDirectory()) throw new Error('Resolved parent is not a directory')
  } catch (error) {
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      `Output parent ${terminalValue(lexicalParent)} is unavailable; no package was published.`,
      error
    )
  }
  return {
    destination: join(stableParent, basename(lexicalDestination))
  }
}

async function directoryIdentity(path: string): Promise<DirectoryIdentity> {
  const metadata = await lstat(path, { bigint: true })
  if (!metadata.isDirectory()) throw new Error('Claimed output is not a directory')
  return { device: metadata.dev, inode: metadata.ino }
}

async function assertClaimedDirectory(path: string, identity: DirectoryIdentity): Promise<void> {
  let matches = false
  try {
    const current = await directoryIdentity(path)
    matches = current.device === identity.device && current.inode === identity.inode
  } catch (error) {
    if (!isFileSystemError(error, 'ENOENT')) throw error
  }
  if (!matches) {
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      'The atomically claimed output directory changed during publication; no rollback or deletion was attempted.'
    )
  }
}

async function publishConformancePackage(
  target: PublicationTarget,
  outputContent: Record<Exclude<OutputFileName, 'conformance-manifest.json'>, string>,
  manifest: ConformanceManifest
): Promise<void> {
  await assertDestinationAbsent(target.destination)

  let claimedIdentity: DirectoryIdentity
  try {
    await mkdir(target.destination, { mode: 0o700 })
    claimedIdentity = await directoryIdentity(target.destination)
  } catch (error) {
    if (isFileSystemError(error, 'EEXIST')) {
      throw new ReceiptConformanceError(
        'OUTPUT_CONFLICT',
        `Output destination ${terminalValue(target.destination)} was claimed concurrently; caller data was not changed.`,
        error
      )
    }
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      'The output destination could not be atomically claimed; no manifest was committed.',
      error
    )
  }

  try {
    for (const fileName of CONFORMANCE_OUTPUT_FILES) {
      if (fileName === 'conformance-manifest.json') continue
      await assertClaimedDirectory(target.destination, claimedIdentity)
      const publishedPath = join(target.destination, fileName)
      await writeFile(publishedPath, outputContent[fileName], {
        encoding: 'utf8',
        flag: 'wx',
        mode: 0o600
      })
      await assertClaimedDirectory(target.destination, claimedIdentity)
      if (await sha256Text(await readFile(publishedPath, 'utf8')) !== manifest.outputs[fileName]) {
        throw new ReceiptConformanceError(
          'OUTPUT_PUBLICATION',
          `Published output ${terminalValue(fileName)} failed digest verification before manifest commit.`
        )
      }
    }
    const manifestContent = json(manifest)
    await assertClaimedDirectory(target.destination, claimedIdentity)
    const publishedManifestPath = join(target.destination, 'conformance-manifest.json')
    await writeFile(publishedManifestPath, manifestContent, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    })
  } catch (error) {
    if (error instanceof ReceiptConformanceError) throw error
    throw new ReceiptConformanceError(
      'OUTPUT_PUBLICATION',
      'Manifest-last publication failed; an incomplete claimed directory without a valid manifest may remain.',
      error
    )
  }
}

export async function verifyCanonicalReceipt(
  input: unknown,
  outputDirectory: string
): Promise<{
    run: EvaluationRunV2
    bundle: ReportBundle
    manifest: ConformanceManifest
  }> {
  const inputVersion = originalSchemaVersion(input)
  const publicationTarget = await resolvePublicationTarget(outputDirectory)
  await assertDestinationAbsent(publicationTarget.destination)
  if (inputVersion === 'mac-evaluation-run/v1') await assertAllowedLegacyBenchmark(input)
  assertReviewHistoryOrder(input)
  const run = await normalizeAndVerify(input)
  await assertCanonicalBenchmark(run)
  assertClaimLedgerBindings(run)
  assertStressFractureBindings(run)
  assertCitationEvidence(run)

  const bundle = generateReportBundle(run)
  assertClaimLedgerParity(run, bundle)
  assertSealedProseReuse(run, bundle)

  const outputContent: Record<Exclude<OutputFileName, 'conformance-manifest.json'>, string> = {
    'canonical-receipt.v2.json': json(run),
    'lab-note.html': bundle.labNoteHtml,
    'methods-and-evidence.html': bundle.methodsHtml,
    'claim-ledger.csv': bundle.claimLedgerCsv,
    'claim-ledger.json': bundle.claimLedgerJson,
    'stress-fracture-map.json': bundle.stressFractureJson,
    'witness-protocols.json': bundle.witnessProtocolsJson
  }
  const outputDigests = Object.fromEntries(await Promise.all(
    Object.entries(outputContent).map(async ([fileName, content]) => [fileName, await sha256Text(content)])
  ))
  const manifest: ConformanceManifest = {
    schemaVersion: 'cylon-receipt-conformance/v1',
    originalSchemaVersion: inputVersion,
    exportedSchemaVersion: 'mac-evaluation-run/v2',
    receiptIntegrityDigest: run.integrityDigest,
    benchmarkIntegrityDigest: run.benchmark.definition.integrityDigest,
    outputs: outputDigests
  }
  await publishConformancePackage(publicationTarget, outputContent, manifest)
  return { run, bundle, manifest }
}

function parseArguments(arguments_: string[]): { receiptPath: string; outputDirectory: string } {
  const values = new Map<string, string>()
  for (let index = 0; index < arguments_.length; index += 2) {
    const key = arguments_[index]
    const value = arguments_[index + 1]
    if (!key?.startsWith('--') || !value) {
      throw new ReceiptConformanceError('INPUT_INVALID', 'Usage: npm run verify:receipt -- --receipt <receipt.json> --output <directory>')
    }
    values.set(key, value)
  }
  const receiptPath = values.get('--receipt')
  const outputDirectory = values.get('--output')
  if (!receiptPath || !outputDirectory || values.size !== 2) {
    throw new ReceiptConformanceError('INPUT_INVALID', 'Usage: npm run verify:receipt -- --receipt <receipt.json> --output <directory>')
  }
  return { receiptPath, outputDirectory }
}

async function main(): Promise<void> {
  const { receiptPath, outputDirectory } = parseArguments(process.argv.slice(2))
  const receipt = parseReceiptInput(await readReceiptInputFile(receiptPath))
  const { manifest } = await verifyCanonicalReceipt(receipt, outputDirectory)
  console.log(`Receipt conformance passed: ${manifest.receiptIntegrityDigest}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exitCode = 1
  })
}
