import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  appendReviewEvent,
  normalizeEvaluationRun,
  validateEvaluationRunV2,
  type ReviewEventV2
} from '@/bench/v2/artifact'

const fixturePath = new URL('../fixtures/demo/witness-theory-adjudicated.json', import.meta.url)

describe('mac-evaluation-run/v2', () => {
  it('normalizes the alpha receipt deterministically and uses stable claim IDs', async () => {
    const alpha = JSON.parse(await readFile(fixturePath, 'utf8')) as { summary: string }
    const first = await normalizeEvaluationRun(alpha)
    const second = await normalizeEvaluationRun(alpha)

    expect(first.schemaVersion).toBe('mac-evaluation-run/v2')
    expect(first).toEqual(second)
    expect(first.integrityDigest).toMatch(/^[a-f0-9]{64}$/)
    expect(first.claimLedger).toHaveLength(15)
    expect(new Set(first.claimLedger.map(row => row.claimId)).size).toBe(15)
    expect(first.claimLedger[0].claimId).toMatch(/^claim:/)
    expect(first.legacyImport?.schemaVersion).toBe('mac-evaluation-run/v1')
    expect(first.summary).toBe(alpha.summary)
  })

  it('detects receipt tampering', async () => {
    const alpha = JSON.parse(await readFile(fixturePath, 'utf8')) as unknown
    const run = await normalizeEvaluationRun(alpha)
    await expect(validateEvaluationRunV2({ ...run, summary: 'Rewritten.' }))
      .rejects.toThrow(/integrity digest/i)
  })

  it('appends review history without allowing sequence rewrites', () => {
    const base: ReviewEventV2[] = [{
      eventId: 'event:claim:run:challenge:explanation:1',
      sequence: 1,
      recordedAt: '2026-07-20T20:00:00.000Z',
      reviewerAlias: 'Reviewer A',
      claimId: 'claim:run:challenge:explanation',
      decision: 'accepted',
      modelValue: 'Model draft'
    }]
    const appended = appendReviewEvent(base, {
      ...base[0],
      eventId: 'event:claim:run:challenge:explanation:2',
      sequence: 2,
      decision: 'revised',
      humanValue: 'Human revision',
      reason: 'The source is narrower.'
    })

    expect(appended).toHaveLength(2)
    expect(base).toHaveLength(1)
    expect(() => appendReviewEvent(appended, { ...appended[1], eventId: 'duplicate' }))
      .toThrow(/next sequence/i)
  })
})
