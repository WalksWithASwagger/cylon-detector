import { stableStringify } from '../../src/bench/artifact'
import type { EvaluationRunV2 } from '../../src/bench/v2/artifact'
import type { ReportBundle } from '../../src/bench/v2/reports'
import { ReceiptConformanceError } from './errors'
import { terminalValue } from './input'

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

export function assertClaimLedgerParity(run: EvaluationRunV2, bundle: ReportBundle): void {
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

export function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
