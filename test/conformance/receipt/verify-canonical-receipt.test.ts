import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import {
  createSyntheticV1Receipt,
  createSyntheticV2Receipt
} from '../../../fixtures/conformance/synthetic-receipts'
import { stableStringify } from '../../../src/bench/artifact'
import { sha256Text } from '../../../src/bench/hash'
import {
  assertSealedProseReuse,
  CONFORMANCE_OUTPUT_FILES,
  MAX_RECEIPT_INPUT_BYTES,
  parseReceiptInput,
  readReceiptInputFile,
  verifyCanonicalReceipt
} from '../../../scripts/verify-canonical-receipt'

const v1FixturePath = new URL('../../../fixtures/conformance/synthetic-receipt.v1.json', import.meta.url)
const v2FixturePath = new URL('../../../fixtures/conformance/synthetic-receipt.v2.json', import.meta.url)
const expectedDigestsPath = new URL('../../../fixtures/conformance/expected-output-digests.json', import.meta.url)

type SyntheticV1Receipt = Awaited<ReturnType<typeof createSyntheticV1Receipt>>
type SyntheticV2Receipt = Awaited<ReturnType<typeof createSyntheticV2Receipt>>

async function fixture<T>(path: URL): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T
}

async function reseal<T extends { integrityDigest: string }>(run: T): Promise<T> {
  const { integrityDigest: _prior, ...unsigned } = run
  return { ...unsigned, integrityDigest: await sha256Text(stableStringify(unsigned)) } as T
}

async function outputBytes(directory: string): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(CONFORMANCE_OUTPUT_FILES.map(async fileName => [
    fileName,
    await readFile(join(directory, fileName), 'utf8')
  ])))
}

async function outputDestination(prefix: string): Promise<{ parent: string; destination: string }> {
  const parent = await mkdtemp(join(tmpdir(), prefix))
  return { parent, destination: join(parent, 'conformance-package') }
}

async function waitForEntry(parent: string, predicate: (name: string) => boolean): Promise<string> {
  for (let attempt = 0; attempt < 2_500; attempt += 1) {
    const match = (await readdir(parent)).find(predicate)
    if (match) return match
    await delay(2)
  }
  throw new Error(`Timed out waiting for publication entry in ${parent}`)
}

async function largeReceipt(receipt: SyntheticV2Receipt): Promise<SyntheticV2Receipt> {
  return reseal({
    ...receipt,
    summary: `${receipt.summary}\n${'x'.repeat(8 * 1024 * 1024)}`
  })
}

async function resealV1(
  run: SyntheticV1Receipt,
  benchmark: SyntheticV1Receipt['benchmark']
): Promise<SyntheticV1Receipt> {
  const benchmarkDigest = await sha256Text(stableStringify(benchmark))
  const { artifactSha256: _prior, ...priorUnsigned } = run
  const unsigned = { ...priorUnsigned, benchmark, benchmarkDigest }
  return {
    ...unsigned,
    artifactSha256: await sha256Text(stableStringify(unsigned))
  }
}

describe('canonical receipt conformance verifier', () => {
  it('produces identical deterministic outputs in two isolated directories', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const expected = await fixture<Record<string, unknown>>(expectedDigestsPath)
    const firstDirectory = (await outputDestination('receipt-conformance-a-')).destination
    const secondDirectory = (await outputDestination('receipt-conformance-b-')).destination

    const first = await verifyCanonicalReceipt(receipt, firstDirectory)
    const second = await verifyCanonicalReceipt(receipt, secondDirectory)

    expect(await outputBytes(firstDirectory)).toEqual(await outputBytes(secondDirectory))
    expect(first.manifest.outputs).toEqual(second.manifest.outputs)
    expect(first.manifest.receiptIntegrityDigest).toBe(receipt.integrityDigest)
    expect(first.manifest).toEqual(expected['synthetic-v2'])
  })

  it('rejects a tampered receipt before writing output', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const directory = join(tmpdir(), `receipt-tampered-${crypto.randomUUID()}`)

    await expect(verifyCanonicalReceipt({ ...receipt, summary: 'tampered' }, directory))
      .rejects.toMatchObject({ code: 'RECEIPT_INTEGRITY' })
    await expect(access(directory)).rejects.toThrow()
  })

  it('classifies schema-invalid reordered review history separately', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const reordered = await reseal({ ...receipt, reviewEvents: [...receipt.reviewEvents].reverse() })

    await expect(verifyCanonicalReceipt(reordered, join(tmpdir(), `receipt-history-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'REVIEW_HISTORY' })
  })

  it('rejects a receipt snapshot that does not match the canonical benchmark registry', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const challenges = structuredClone(receipt.benchmark.challenges)
    challenges[0].title = 'Mutated snapshot title'
    const mismatched = await reseal({
      ...receipt,
      benchmark: { ...receipt.benchmark, challenges }
    })

    await expect(verifyCanonicalReceipt(mismatched, join(tmpdir(), `receipt-benchmark-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'BENCHMARK_MISMATCH' })
  })

  it('rejects a resealed legacy receipt whose benchmark has no explicit canonical mapping', async () => {
    const receipt = await fixture<SyntheticV1Receipt>(v1FixturePath)
    const benchmark = { ...receipt.benchmark, version: '9.9.9-other', title: 'Other benchmark' }
    const mismatched = await resealV1(receipt, benchmark)

    await expect(verifyCanonicalReceipt(mismatched, join(tmpdir(), `receipt-legacy-map-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'BENCHMARK_MISMATCH' })
  })

  it('rejects a referenced citation that is missing from verified citations', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const missing = await reseal({
      ...receipt,
      verifiedCitations: receipt.verifiedCitations.slice(1)
    })

    await expect(verifyCanonicalReceipt(missing, join(tmpdir(), `receipt-citation-missing-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'CITATION_EVIDENCE' })
  })

  it('rejects a referenced citation whose verification failed', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const verifiedCitations = structuredClone(receipt.verifiedCitations)
    verifiedCitations[0].verification = 'not_found'
    const failed = await reseal({ ...receipt, verifiedCitations })

    await expect(verifyCanonicalReceipt(failed, join(tmpdir(), `receipt-citation-failed-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'CITATION_EVIDENCE' })
  })

  it('rejects a citation reassigned to the wrong challenge field', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const aiDraft = structuredClone(receipt.aiDraft)
    aiDraft.challenges[0].explanation.citations[0].supportsField = 'challenges.provenance-flip.mechanism'
    const reassigned = await reseal({ ...receipt, aiDraft })

    await expect(verifyCanonicalReceipt(reassigned, join(tmpdir(), `receipt-citation-field-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'CITATION_EVIDENCE' })
  })

  it('rejects contradictory Claim Ledger coordinates and model text', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const claimLedger = structuredClone(receipt.claimLedger)
    claimLedger[0].challenge.id = 'synesthesia'
    claimLedger[0].modelDraft = 'Contradictory unsealed model text'
    const contradictory = await reseal({ ...receipt, claimLedger })

    await expect(verifyCanonicalReceipt(contradictory, join(tmpdir(), `receipt-ledger-coordinate-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'LEDGER_BINDING' })
  })

  it('rejects an omitted matching review event and a false final call', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const reviewEvents = [...receipt.reviewEvents, {
      eventId: `event:${(receipt.reviewEvents.length + 1).toString().padStart(2, '0')}`,
      sequence: receipt.reviewEvents.length + 1,
      recordedAt: '2030-01-02T03:04:05.000Z',
      reviewerAlias: 'reviewer-fixture-v2',
      claimId: receipt.claimLedger[0].claimId,
      decision: 'revised' as const,
      modelValue: receipt.claimLedger[0].modelDraft,
      humanValue: 'SEALED HUMAN REVISION: complete event history fixture.',
      reason: 'SEALED HUMAN REASON: later evidence narrowed the claim.'
    }]
    const claimLedger = structuredClone(receipt.claimLedger)
    claimLedger[0].finalCall = {
      decision: 'rejected',
      reason: 'False final call',
      eventId: claimLedger[0].humanEventIds[0]
    }
    const omitted = await reseal({ ...receipt, reviewEvents, claimLedger })

    await expect(verifyCanonicalReceipt(omitted, join(tmpdir(), `receipt-ledger-history-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'LEDGER_BINDING' })
  })

  it('binds every Stress Fracture call to a deterministic verdict event stream', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const verdictEvents = receipt.reviewEvents.filter(event => event.claimId.startsWith(`verdict:${receipt.runId}:`))

    expect(verdictEvents.map(event => ({
      claimId: event.claimId,
      decision: event.decision,
      modelValue: event.modelValue,
      reason: event.reason
    }))).toEqual(receipt.stressFractureMap.map(fracture => ({
      claimId: `verdict:${receipt.runId}:${fracture.challengeId}`,
      decision: fracture.humanDecision,
      modelValue: fracture.modelVerdict,
      reason: fracture.rationale
    })))
  })

  it('rejects a Stress Fracture model verdict that contradicts the AI draft', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const stressFractureMap = structuredClone(receipt.stressFractureMap)
    stressFractureMap[0].modelVerdict = 'breaks'
    const contradictory = await reseal({ ...receipt, stressFractureMap })

    await expect(verifyCanonicalReceipt(contradictory, join(tmpdir(), `receipt-verdict-model-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'VERDICT_BINDING' })
  })

  it('rejects a Stress Fracture human call that omits the latest verdict event', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const reviewEvents = [...receipt.reviewEvents, {
      eventId: `event:${(receipt.reviewEvents.length + 1).toString().padStart(2, '0')}`,
      sequence: receipt.reviewEvents.length + 1,
      recordedAt: '2030-01-02T03:04:05.000Z',
      reviewerAlias: 'reviewer-fixture-v2',
      claimId: `verdict:${receipt.runId}:provenance-flip`,
      decision: 'revised' as const,
      modelValue: 'strained',
      humanValue: 'breaks',
      reason: 'SEALED VERDICT REVISION: latest verdict event must control the map.'
    }]
    const omitted = await reseal({ ...receipt, reviewEvents })

    await expect(verifyCanonicalReceipt(omitted, join(tmpdir(), `receipt-verdict-latest-${crypto.randomUUID()}`)))
      .rejects.toMatchObject({ code: 'VERDICT_BINDING' })
  })

  it('keeps Claim Ledger CSV and JSON row IDs in stable one-to-one parity', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const directory = (await outputDestination('receipt-ledger-')).destination
    await verifyCanonicalReceipt(receipt, directory)

    const jsonRows = JSON.parse(await readFile(join(directory, 'claim-ledger.json'), 'utf8')) as Array<{ claimId: string }>
    const csvIds = (await readFile(join(directory, 'claim-ledger.csv'), 'utf8'))
      .trim().split('\n').slice(1).map(line => JSON.parse(`[${line}]`)[0] as string)

    expect(csvIds).toEqual(jsonRows.map(row => row.claimId))
    expect(new Set(csvIds).size).toBe(csvIds.length)
  })

  it('rejects report bytes that omit sealed scientific prose', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const directory = (await outputDestination('receipt-sealed-prose-')).destination
    const result = await verifyCanonicalReceipt(receipt, directory)

    expect(() => assertSealedProseReuse(receipt, {
      ...result.bundle,
      methodsHtml: result.bundle.methodsHtml
        .split(receipt.claimLedger[0].modelDraft)
        .join('independently regenerated prose')
    })).toThrow(expect.objectContaining({ code: 'SEALED_PROSE' }))
  })

  it('normalizes a synthetic v1 fixture deterministically and exports only v2', async () => {
    const receipt = await fixture<SyntheticV1Receipt>(v1FixturePath)
    const expected = await fixture<Record<string, unknown>>(expectedDigestsPath)
    const firstDirectory = (await outputDestination('receipt-v1-a-')).destination
    const secondDirectory = (await outputDestination('receipt-v1-b-')).destination

    const first = await verifyCanonicalReceipt(receipt, firstDirectory)
    const second = await verifyCanonicalReceipt(receipt, secondDirectory)
    const exported = JSON.parse(await readFile(join(firstDirectory, 'canonical-receipt.v2.json'), 'utf8'))

    expect(exported.schemaVersion).toBe('mac-evaluation-run/v2')
    expect(exported.legacyImport).toEqual({
      schemaVersion: 'mac-evaluation-run/v1',
      originalIntegrityDigest: receipt.artifactSha256
    })
    expect(exported.summary).toBe(receipt.summary)
    expect(first.bundle.labNoteHtml).toContain(receipt.summary)
    expect(first.bundle.methodsHtml).toContain(receipt.summary)
    expect(first.manifest.originalSchemaVersion).toBe('mac-evaluation-run/v1')
    expect(first.manifest.outputs).toEqual(second.manifest.outputs)
    expect(first.manifest).toEqual(expected['synthetic-v1-normalized'])
    expect(CONFORMANCE_OUTPUT_FILES.some(fileName => fileName.includes('.v1.'))).toBe(false)
  })

  it('keeps committed fixtures reproducible from fixed synthetic factories', async () => {
    const v1 = await fixture<SyntheticV1Receipt>(v1FixturePath)
    const v2 = await fixture<SyntheticV2Receipt>(v2FixturePath)

    expect(v1).toEqual(await createSyntheticV1Receipt())
    expect(v2).toEqual(await createSyntheticV2Receipt())
    expect(v1.paper.authors).toBeUndefined()
    expect(v2.paper.authors).toBeUndefined()
    expect(v1.humanAdjudication.reviewer).toBe('reviewer-fixture-legacy')
    expect(new Set(v2.reviewEvents.map(event => event.reviewerAlias))).toEqual(new Set(['reviewer-fixture-v2']))
  })

  it('refuses existing empty/non-empty directories, files, and symlinks without changing them', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const parent = await mkdtemp(join(tmpdir(), 'receipt-existing-output-'))
    const directory = join(parent, 'existing-directory')
    const emptyDirectory = join(parent, 'existing-empty-directory')
    const file = join(parent, 'existing-file')
    const link = join(parent, 'existing-link')
    await mkdir(directory)
    await mkdir(emptyDirectory)
    await writeFile(join(directory, 'caller-data.txt'), 'preserve me', 'utf8')
    await writeFile(file, 'preserve me', 'utf8')
    await symlink(directory, link)

    for (const destination of [emptyDirectory, directory, file, link]) {
      await expect(verifyCanonicalReceipt(receipt, destination))
        .rejects.toMatchObject({ code: 'OUTPUT_CONFLICT' })
    }
    expect(await readFile(join(directory, 'caller-data.txt'), 'utf8')).toBe('preserve me')
    expect(await readFile(file, 'utf8')).toBe('preserve me')
    await expect(access(join(directory, 'conformance-manifest.json'))).rejects.toThrow()
    expect(await readdir(emptyDirectory)).toEqual([])
  })

  it('holds publication to the parent realpath resolved before a mutable symlink changes', async () => {
    const base = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const receipt = await largeReceipt(base)
    const root = await mkdtemp(join(tmpdir(), 'receipt-parent-symlink-'))
    const firstParent = join(root, 'first-parent')
    const secondParent = join(root, 'second-parent')
    const parentLink = join(root, 'parent-link')
    await mkdir(firstParent)
    await mkdir(secondParent)
    await symlink(firstParent, parentLink)
    const publication = verifyCanonicalReceipt(receipt, join(parentLink, 'package'))

    await waitForEntry(firstParent, name => name === 'package')
    await unlink(parentLink)
    await symlink(secondParent, parentLink)
    await publication

    await expect(access(join(firstParent, 'package', 'conformance-manifest.json'))).resolves.toBeUndefined()
    await expect(access(join(secondParent, 'package'))).rejects.toThrow()
  })

  it('never overwrites or deletes a swapped replacement and leaves no committed manifest', async () => {
    const base = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const receipt = await largeReceipt(base)
    const { parent, destination } = await outputDestination('receipt-claimed-swap-')
    const displaced = join(parent, 'displaced-claimed-directory')
    const publication = verifyCanonicalReceipt(receipt, destination).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error })
    )

    await waitForEntry(parent, name => name === 'conformance-package')
    await rename(destination, displaced)
    await mkdir(destination)
    await writeFile(join(destination, 'caller-data.txt'), 'preserve replacement', 'utf8')
    await writeFile(join(destination, 'canonical-receipt.v2.json'), 'preserve existing output', {
      encoding: 'utf8',
      flag: 'wx'
    })

    expect((await publication).error).toMatchObject({ code: 'OUTPUT_PUBLICATION' })
    expect(await readFile(join(destination, 'caller-data.txt'), 'utf8')).toBe('preserve replacement')
    expect(await readFile(join(destination, 'canonical-receipt.v2.json'), 'utf8')).toBe('preserve existing output')
    await expect(access(join(destination, 'conformance-manifest.json'))).rejects.toThrow()
    await expect(access(join(displaced, 'conformance-manifest.json'))).rejects.toThrow()
    await expect(access(displaced)).resolves.toBeUndefined()
  })

  it('publishes one complete package under a concurrent atomic claim conflict', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const { destination } = await outputDestination('receipt-concurrent-output-')

    const results = await Promise.allSettled([
      verifyCanonicalReceipt(receipt, destination),
      verifyCanonicalReceipt(receipt, destination)
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await readdir(destination)).sort()).toEqual([...CONFORMANCE_OUTPUT_FILES].sort())
  })

  it('matches every published file to the read-back digest manifest', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const { destination } = await outputDestination('receipt-file-digests-')
    await verifyCanonicalReceipt(receipt, destination)
    const manifest = JSON.parse(await readFile(join(destination, 'conformance-manifest.json'), 'utf8')) as {
      outputs: Record<string, string>
    }

    for (const [fileName, expectedDigest] of Object.entries(manifest.outputs)) {
      expect(await sha256Text(await readFile(join(destination, fileName), 'utf8'))).toBe(expectedDigest)
    }
  })

  it('enforces the CLI input byte limit at the exact boundary', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'receipt-input-limit-'))
    const allowed = join(parent, 'allowed.json')
    const oversized = join(parent, 'oversized.json')
    await writeFile(allowed, Buffer.alloc(MAX_RECEIPT_INPUT_BYTES, 0x20))
    await writeFile(oversized, Buffer.alloc(MAX_RECEIPT_INPUT_BYTES + 1, 0x20))

    expect(Buffer.byteLength(await readReceiptInputFile(allowed))).toBe(MAX_RECEIPT_INPUT_BYTES)
    await expect(readReceiptInputFile(oversized)).rejects.toMatchObject({ code: 'INPUT_TOO_LARGE' })
  })

  it('wraps malformed JSON without echoing parser-controlled terminal bytes', () => {
    const malformed = '{"schemaVersion":"mac-evaluation-run/v2\u001b[31m"'

    expect(() => parseReceiptInput(malformed)).toThrow(expect.objectContaining({
      code: 'INPUT_INVALID',
      message: 'INPUT_INVALID: Receipt input is not valid JSON.'
    }))
  })

  it('escapes and limits receipt-controlled identifiers in terminal-facing errors', async () => {
    const receipt = await fixture<SyntheticV2Receipt>(v2FixturePath)
    const aiDraft = structuredClone(receipt.aiDraft)
    const adversarialId = `citation:\n\u001b\u007f\u0085\u2028\u2029\u202e\u2066 forged-terminal-line ${'x'.repeat(400)}`
    aiDraft.theory.centralClaims[0].citations = [{
      id: adversarialId,
      pdfPage: 1,
      quote: 'Synthetic adversarial identifier fixture.',
      supportsField: 'theory.centralClaims'
    }]
    const adversarial = await reseal({ ...receipt, aiDraft })

    let failure: unknown
    try {
      await verifyCanonicalReceipt(adversarial, join(tmpdir(), `receipt-terminal-${crypto.randomUUID()}`))
    } catch (error) {
      failure = error
    }
    expect(failure).toMatchObject({ code: 'CITATION_EVIDENCE' })
    const message = (failure as Error).message
    expect(message).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069]/)
    expect(message).toContain('\\n\\u001b\\u007f\\u0085\\u2028\\u2029\\u202e\\u2066')
    expect(message.length).toBeLessThan(300)
  })
})
