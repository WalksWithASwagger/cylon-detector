import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { normalizeEvaluationRun } from '@/bench/v2/artifact'
import { generateReportBundle } from '@/bench/v2/reports'

const fixturePath = new URL('../fixtures/demo/witness-theory-adjudicated.json', import.meta.url)

describe('canonical receipt reports', () => {
  it('generates static, deterministic outputs from one v2 receipt', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const first = generateReportBundle(run)
    const second = generateReportBundle(run)

    expect(first).toEqual(second)
    expect(first.labNoteHtml).toContain(run.summary)
    expect(first.methodsHtml).toContain(run.integrityDigest)
    expect(first.methodsHtml).toContain('Machine said')
    expect(first.methodsHtml).toContain('Human called')
    expect(first.labNoteHtml).not.toMatch(/<script/i)
    expect(first.methodsHtml).not.toMatch(/<script/i)
    expect(first.methodsHtml).toContain('@media print')
  })

  it('keeps Claim Ledger CSV and JSON rows in exact parity', async () => {
    const run = await normalizeEvaluationRun(JSON.parse(await readFile(fixturePath, 'utf8')))
    const bundle = generateReportBundle(run)
    const rows = JSON.parse(bundle.claimLedgerJson) as Array<{ claimId: string }>
    const csvIds = bundle.claimLedgerCsv.trim().split('\n').slice(1).map(line =>
      JSON.parse(`[${line}]`)[0] as string
    )

    expect(rows.map(row => row.claimId)).toEqual(csvIds)
    expect(rows).toHaveLength(run.claimLedger.length)
    expect(bundle.stressFractureJson).not.toMatch(/score|leaderboard|ranking/i)
  })
})
