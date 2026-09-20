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

export type OutputFileName = typeof CONFORMANCE_OUTPUT_FILES[number]

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
