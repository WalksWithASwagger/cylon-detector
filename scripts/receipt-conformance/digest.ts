import { lstat, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { sha256Text } from '../../src/bench/hash'
import type { EvaluationRunV2 } from '../../src/bench/v2/artifact'
import {
  CONFORMANCE_OUTPUT_FILES,
  ReceiptConformanceError,
  type ConformanceManifest,
  type OutputFileName
} from './errors'
import { assertDestinationAbsent, isFileSystemError, terminalValue, type PublicationTarget } from './input'
import { json } from './report'

interface DirectoryIdentity {
  device: bigint
  inode: bigint
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

export async function createConformanceManifest(
  inputVersion: ConformanceManifest['originalSchemaVersion'],
  run: EvaluationRunV2,
  outputContent: Record<Exclude<OutputFileName, 'conformance-manifest.json'>, string>
): Promise<ConformanceManifest> {
  const outputDigests = Object.fromEntries(await Promise.all(
    Object.entries(outputContent).map(async ([fileName, content]) => [fileName, await sha256Text(content)])
  ))
  return {
    schemaVersion: 'cylon-receipt-conformance/v1',
    originalSchemaVersion: inputVersion,
    exportedSchemaVersion: 'mac-evaluation-run/v2',
    receiptIntegrityDigest: run.integrityDigest,
    benchmarkIntegrityDigest: run.benchmark.definition.integrityDigest,
    outputs: outputDigests
  }
}

export async function publishConformancePackage(
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
