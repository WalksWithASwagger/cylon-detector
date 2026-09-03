import { cp, mkdtemp, readFile, symlink, unlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stableStringify } from '../../../src/bench/artifact'
import { sha256Text } from '../../../src/bench/hash'
import { normalizeEvaluationRun } from '../../../src/bench/v2/artifact'
import {
  PORTABLE_COLLABORATION_FILES,
  createSyntheticCollaborationFixtures
} from '../../../fixtures/collaboration/synthetic-collaboration'
import {
  assertBlindPacketRedaction,
  sanitizeCliMessage,
  validatePortableCollaborationKit,
  withNetworkDisabled
} from '../../../scripts/validate-collaboration-packet'

const fixtureDirectory = fileURLToPath(new URL('../../../fixtures/collaboration/', import.meta.url))
const receiptPath = new URL('../../../fixtures/conformance/synthetic-receipt.v2.json', import.meta.url)
const documentationPath = new URL('../../../docs/operations/portable-rehearsal.md', import.meta.url)

async function copiedKit(prefix: string): Promise<string> {
  const destination = await mkdtemp(join(tmpdir(), prefix))
  await Promise.all(PORTABLE_COLLABORATION_FILES.map(fileName => cp(
    join(fixtureDirectory, fileName),
    join(destination, fileName)
  )))
  return destination
}

async function jsonFile<T>(directory: string, fileName: string): Promise<T> {
  return JSON.parse(await readFile(join(directory, fileName), 'utf8')) as T
}

async function rewriteSealed(
  directory: string,
  fileName: string,
  mutate: (artifact: Record<string, any>) => void | Promise<void>
): Promise<void> {
  const artifact = await jsonFile<Record<string, any>>(directory, fileName)
  await mutate(artifact)
  const { integrityDigest: _prior, ...unsigned } = artifact
  artifact.integrityDigest = await sha256Text(stableStringify(unsigned))
  await writeFile(join(directory, fileName), `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')
}

async function portableBytes(directory: string): Promise<string> {
  const contents = await Promise.all(PORTABLE_COLLABORATION_FILES.map(async fileName => ({
    fileName,
    contents: await readFile(join(directory, fileName), 'utf8')
  })))
  return sha256Text(stableStringify(contents))
}

async function syncManifestBundleDigest(directory: string): Promise<void> {
  const bundle = await jsonFile<Record<string, any>>(directory, 'disagreement-bundle.json')
  const manifest = await jsonFile<Record<string, any>>(directory, 'manifest.json')
  manifest.bundleIntegrityDigest = bundle.integrityDigest
  await writeFile(join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`, 'utf8')
}

describe('collaboration packet conformance', () => {
  it.each([
    ['title', 'Synthetic Relay Paper'],
    ['author', 'Synthetic Author'],
    ['institution', 'Synthetic Institute'],
    ['doi', '10.0000/synthetic'],
    ['theoryName', 'Synthetic Relay Theory'],
    ['modelIdentity', 'synthetic-conformance-model'],
    ['pdf', 'synthetic-relay-paper.pdf'],
    ['sourceQuote', 'Synthetic source quotation.'],
    ['rawSourceDigest', 'a'.repeat(64)]
  ])('rejects a nested prohibited blind field: %s', (field, value) => {
    const rawPacket = {
      schemaVersion: 'blind-review-packet/v1',
      commitments: [{ redactionProbe: { [field]: value } }]
    }

    expect(() => assertBlindPacketRedaction(rawPacket)).toThrow(/blind packet.*prohibited/i)
  })

  it.each([
    ['title', 'Synthetic Relay Paper'],
    ['author', 'Synthetic Author'],
    ['institution', 'Synthetic Institute'],
    ['doi', '10.0000/synthetic'],
    ['theoryName', 'Synthetic Relay Theory'],
    ['modelIdentity', 'synthetic-conformance-model'],
    ['pdf', 'synthetic-relay-paper.pdf'],
    ['sourceQuote', 'Synthetic source quotation.'],
    ['rawSourceDigest', 'a'.repeat(64)]
  ])('rejects a top-level prohibited blind field before schema parsing: %s', (field, value) => {
    expect(() => assertBlindPacketRedaction({
      schemaVersion: 'blind-review-packet/v1',
      [field]: value
    })).toThrow(/blind packet.*prohibited/i)
  })

  it('keeps committed portable fixtures reproducible from canonical collaboration APIs', async () => {
    const receipt = await normalizeEvaluationRun(JSON.parse(await readFile(receiptPath, 'utf8')))
    const expected = await createSyntheticCollaborationFixtures(receipt)

    for (const fileName of PORTABLE_COLLABORATION_FILES) {
      expect(await readFile(join(fixtureDirectory, fileName), 'utf8')).toBe(expected[fileName])
    }
  })

  it('validates identical deterministic output after portable files move to two isolated machines', async () => {
    const machineA = await copiedKit('collaboration-machine-a-')
    const machineB = await copiedKit('collaboration-machine-b-')

    const first = await validatePortableCollaborationKit(machineA)
    const second = await validatePortableCollaborationKit(machineB)

    expect(first).toEqual(second)
    expect(first).toMatchObject({
      artifactCount: 8,
      contributionCount: 2,
      conflictingClaimCount: 1,
      networkAccess: 'disabled'
    })
  })

  it('blocks fetch and socket connections during the full file-only rehearsal', async () => {
    await withNetworkDisabled(async () => {
      await expect(fetch('https://example.invalid/forbidden')).rejects.toThrow(/network access is disabled/i)
      const { Socket } = await import('node:net')
      expect(() => new Socket().connect(443, 'example.invalid')).toThrow(/network access is disabled/i)
      expect(() => http.get('http://example.invalid/forbidden')).toThrow(/network access is disabled/i)
    })
  })

  it('serializes concurrent network guards and restores the exact fetch descriptor', async () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'fetch')
    const events: string[] = []
    const first = withNetworkDisabled(async () => {
      events.push('first:start')
      await new Promise(resolveDelay => setTimeout(resolveDelay, 20))
      events.push('first:end')
    })
    const second = withNetworkDisabled(async () => {
      events.push('second:start')
      events.push('second:end')
    })

    await Promise.all([first, second])

    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end'])
    expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toEqual(before)
  })

  it('restores the network guard after a validation operation fails', async () => {
    const before = Object.getOwnPropertyDescriptor(globalThis, 'fetch')

    await expect(withNetworkDisabled(async () => {
      throw new Error('Synthetic validation failure')
    })).rejects.toThrow('Synthetic validation failure')

    expect(Object.getOwnPropertyDescriptor(globalThis, 'fetch')).toEqual(before)
  })

  it('rejects actual provenance values hidden under otherwise allowed blind fields', async () => {
    const packet = await jsonFile<Record<string, unknown>>(fixtureDirectory, 'blind-review-packet.json')
    const envelope = await jsonFile<Record<string, unknown>>(fixtureDirectory, 'provenance-envelope.json')
    const paper = envelope.paper as Record<string, unknown>
    const evidence = envelope.evidence as Array<{ sources: Array<{ quote: string }> }>
    const prohibitedValues = [
      paper.title,
      paper.fileName,
      paper.sha256,
      paper.textSha256,
      envelope.theoryName,
      (envelope.analysisIdentity as Record<string, unknown>).model,
      evidence[0].sources[0].quote
    ]

    for (const value of prohibitedValues) {
      expect(() => assertBlindPacketRedaction({ ...packet, alias: value }, envelope))
        .toThrow(/blind packet.*provenance value/i)
    }
  })

  it('rejects a case-changed provenance value hidden under an allowed blind field', async () => {
    const packet = await jsonFile<Record<string, unknown>>(fixtureDirectory, 'blind-review-packet.json')
    const envelope = await jsonFile<Record<string, unknown>>(fixtureDirectory, 'provenance-envelope.json')
    const title = String((envelope.paper as Record<string, unknown>).title).toLocaleUpperCase()

    expect(() => assertBlindPacketRedaction({ ...packet, alias: title }, envelope))
      .toThrow(/blind packet.*provenance value/i)
  })

  it('rejects a changed first call even when the changed lock and contribution are resealed', async () => {
    const directory = await copiedKit('collaboration-mutated-lock-')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', async contribution => {
      contribution.blindLock.calls[0].reason = 'Changed after the first-call lock was exported.'
      const { integrityDigest: _prior, ...unsignedLock } = contribution.blindLock
      contribution.blindLock.integrityDigest = await sha256Text(stableStringify(unsignedLock))
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/locked first call changed/i)
  })

  it('rejects bundle import when the run ID does not match', async () => {
    const directory = await copiedKit('collaboration-run-mismatch-')
    await rewriteSealed(directory, 'provenance-envelope.json', envelope => {
      envelope.envelopeId = '90000000-0000-4000-8000-000000000009'
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/run id mismatch/i)
  })

  it('rejects bundle import when a contribution packet digest does not match', async () => {
    const directory = await copiedKit('collaboration-packet-mismatch-')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', contribution => {
      contribution.packetIntegrityDigest = 'd'.repeat(64)
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/packet digest mismatch/i)
  })

  it('rejects bundle import when contributor IDs are duplicated', async () => {
    const directory = await copiedKit('collaboration-contributor-duplicate-')
    const cedar = await jsonFile<Record<string, any>>(directory, 'reviewer-cedar.second-call-contribution.json')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', contribution => {
      contribution.contributionId = cedar.contributionId
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/duplicate contributor id/i)
  })

  it('rejects duplicate reviewer aliases rather than making dissent attribution ambiguous', async () => {
    const directory = await copiedKit('collaboration-alias-duplicate-')
    const cedar = await jsonFile<Record<string, any>>(directory, 'reviewer-cedar.second-call-contribution.json')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', contribution => {
      contribution.reviewerAlias = cedar.reviewerAlias
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/duplicate reviewer alias/i)
  })

  it('rejects duplicate second calls even when the contribution is resealed', async () => {
    const directory = await copiedKit('collaboration-second-call-duplicate-')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', contribution => {
      contribution.provenanceReveal.secondCalls.push(contribution.provenanceReveal.secondCalls[0])
      contribution.provenanceReveal.deltas.push(contribution.provenanceReveal.deltas[0])
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/second calls contain duplicate/i)
  })

  it('rejects an incomplete second-call set even when both first-call files are resealed', async () => {
    const directory = await copiedKit('collaboration-second-call-subset-')
    const packet = await jsonFile<Record<string, any>>(directory, 'blind-review-packet.json')
    const extraCall = {
      blindClaimId: packet.commitments[1].blindClaimId,
      judgment: 'strained',
      confidence: 'low',
      responseTimeMs: 2200,
      reason: 'Synthetic second locked call used only for subset rejection.'
    }
    await rewriteSealed(directory, 'reviewer-lumen.locked-first-call.json', async contribution => {
      contribution.blindLock.calls.push(extraCall)
      const { integrityDigest: _prior, ...unsignedLock } = contribution.blindLock
      contribution.blindLock.integrityDigest = await sha256Text(stableStringify(unsignedLock))
    })
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', async contribution => {
      contribution.blindLock.calls.push(extraCall)
      const { integrityDigest: _prior, ...unsignedLock } = contribution.blindLock
      contribution.blindLock.integrityDigest = await sha256Text(stableStringify(unsignedLock))
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/second calls must exactly match/i)
  })

  it('rejects a forged provenance delta even when the contribution is resealed', async () => {
    const directory = await copiedKit('collaboration-delta-forged-')
    await rewriteSealed(directory, 'reviewer-lumen.second-call-contribution.json', contribution => {
      contribution.provenanceReveal.deltas[0].changed = false
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/provenance delta mismatch/i)
  })

  it('rejects a provenance envelope whose raw source digest no longer binds the packet', async () => {
    const directory = await copiedKit('collaboration-source-mismatch-')
    await rewriteSealed(directory, 'provenance-envelope.json', envelope => {
      envelope.paper.sha256 = 'e'.repeat(64)
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/source digest mismatch/i)
  })

  it('preserves conflicting reviewer contributions without consensus fields or averaging', async () => {
    const bundle = await jsonFile<Record<string, any>>(fixtureDirectory, 'disagreement-bundle.json')
    const judgments = bundle.disagreements[0].calls.map((call: { judgment: string }) => call.judgment)
    const objectKeys: string[] = []
    JSON.stringify(bundle, (key, value) => {
      if (key) objectKeys.push(key.toLowerCase())
      return value
    })

    expect(judgments).toEqual(['supported', 'unsupported'])
    expect(bundle.contributions).toHaveLength(2)
    expect(objectKeys).not.toContain('score')
    expect(objectKeys).not.toContain('average')
    expect(objectKeys).not.toContain('consensus')
  })

  it('rejects an outer-resealed bundle with changed nested packet bytes', async () => {
    const directory = await copiedKit('collaboration-nested-tamper-')
    await rewriteSealed(directory, 'disagreement-bundle.json', bundle => {
      bundle.packet.alias = 'Changed nested alias'
    })
    await syncManifestBundleDigest(directory)

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/bundle packet does not match/i)
  })

  it('rejects structural score and aggregation fields before schema parsing can strip them', async () => {
    const directory = await copiedKit('collaboration-aggregation-')
    await rewriteSealed(directory, 'disagreement-bundle.json', bundle => {
      bundle.disagreements[0].scores = [0.25, 0.75]
      bundle.aggregation = 'synthetic consensus'
    })

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/prohibited aggregation field/i)
  })

  it('rejects reordered contributions instead of making the bundle digest machine-order dependent', async () => {
    const directory = await copiedKit('collaboration-reordered-')
    await rewriteSealed(directory, 'disagreement-bundle.json', bundle => {
      bundle.contributions.reverse()
    })
    await syncManifestBundleDigest(directory)

    await expect(validatePortableCollaborationKit(directory)).rejects.toThrow(/bundle contributions do not match/i)
  })

  it('rejects missing, unexpected, symlinked, and oversized portable files', async () => {
    const missing = await copiedKit('collaboration-missing-')
    await unlink(join(missing, 'manifest.json'))
    await expect(validatePortableCollaborationKit(missing)).rejects.toThrow(/missing required file/i)

    const extra = await copiedKit('collaboration-extra-')
    await writeFile(join(extra, 'unexpected.json'), '{}\n', 'utf8')
    await expect(validatePortableCollaborationKit(extra)).rejects.toThrow(/unexpected file/i)

    const linked = await copiedKit('collaboration-symlink-')
    await unlink(join(linked, 'manifest.json'))
    await symlink(join(fixtureDirectory, 'manifest.json'), join(linked, 'manifest.json'))
    await expect(validatePortableCollaborationKit(linked)).rejects.toThrow(/regular file.*symlink/i)

    const oversized = await copiedKit('collaboration-oversized-')
    await writeFile(join(oversized, 'three-voice-report.html'), 'x'.repeat(5 * 1024 * 1024 + 1), 'utf8')
    await expect(validatePortableCollaborationKit(oversized)).rejects.toThrow(/size limit/i)
  })

  it('performs a deterministic validation without changing any portable bytes', async () => {
    const directory = await copiedKit('collaboration-read-only-')
    const before = await portableBytes(directory)
    await validatePortableCollaborationKit(directory)
    const after = await portableBytes(directory)

    expect(after).toBe(before)
  })

  it('keeps every committed artifact synthetic and free of direct personal identifiers', async () => {
    const combined = (await Promise.all(PORTABLE_COLLABORATION_FILES.map(fileName => (
      readFile(join(fixtureDirectory, fileName), 'utf8')
    )))).join('\n')

    expect(combined).not.toMatch(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
    expect(combined).not.toMatch(/Kris Kr[uü]g|NooCore|WalksWithASwagger/i)
    expect(combined).toMatch(/Synthetic|synthetic/)
    expect(combined).toContain('Reviewer Cedar')
    expect(combined).toContain('Reviewer Lumen')
  })

  it('removes terminal and bidirectional controls from CLI validation messages', () => {
    const message = `unsafe\u001b\u0085\u2028\u202e\u2066name.json`
    const sanitized = sanitizeCliMessage(message)

    expect(sanitized).toBe('unsafe     name.json')
    expect(sanitized).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028-\u202e\u2066-\u2069]/)
  })

  it('documents partial blinding and the non-research tool-rehearsal boundary', async () => {
    const documentation = await readFile(documentationPath, 'utf8')

    expect(documentation).toMatch(/partial blinding/i)
    expect(documentation).toMatch(/tool rehearsal/i)
    expect(documentation).toMatch(/not human-subject research/i)
    expect(documentation).toMatch(/network access.*disabled/i)
  })
})
