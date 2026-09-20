import { pathToFileURL } from 'node:url'
import type { EvaluationRunV2 } from '../src/bench/v2/artifact'
import { generateReportBundle, type ReportBundle } from '../src/bench/v2/reports'
import {
  assertCitationEvidence,
  assertClaimLedgerBindings,
  assertStressFractureBindings
} from './receipt-conformance/citations-ledger'
import { createConformanceManifest, publishConformancePackage } from './receipt-conformance/digest'
import {
  CONFORMANCE_OUTPUT_FILES,
  ReceiptConformanceError,
  type ConformanceManifest,
  type OutputFileName
} from './receipt-conformance/errors'
import {
  assertDestinationAbsent,
  MAX_RECEIPT_INPUT_BYTES,
  parseReceiptInput,
  readReceiptInputFile,
  resolvePublicationTarget
} from './receipt-conformance/input'
import {
  assertAllowedLegacyBenchmark,
  assertCanonicalBenchmark,
  assertReviewHistoryOrder,
  normalizeAndVerify,
  originalSchemaVersion
} from './receipt-conformance/normalize'
import { assertClaimLedgerParity, assertSealedProseReuse, json } from './receipt-conformance/report'

export {
  CONFORMANCE_OUTPUT_FILES,
  MAX_RECEIPT_INPUT_BYTES,
  ReceiptConformanceError,
  parseReceiptInput,
  readReceiptInputFile,
  assertSealedProseReuse
}
export type { ConformanceManifest, ReceiptConformanceErrorCode } from './receipt-conformance/errors'

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
  const manifest = await createConformanceManifest(inputVersion, run, outputContent)
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
