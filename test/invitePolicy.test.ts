import { describe, expect, it } from 'vitest'
import {
  InMemoryInvitePolicy,
  InviteAccessError,
  digestInviteCode
} from '@/server/invitePolicy'

const rawCode = 'cylon_invite_01KJ7J7H2YGXM8T7BNC2YN8N7K'
const pepper = 'test-only-pepper-that-never-ships'
const now = new Date('2026-07-20T20:00:00.000Z')

function policy(overrides: Partial<{
  enabled: boolean
  expiresAt: string
  maxRuns: number
  maxInputCharacters: number
}> = {}) {
  return InMemoryInvitePolicy.fromPlaintextCodes({
    pepper,
    now: () => now,
    invites: [{
      code: rawCode,
      id: 'mac-lab-pilot',
      label: 'MAC Lab pilot',
      enabled: overrides.enabled ?? true,
      expiresAt: overrides.expiresAt ?? '2026-08-01T00:00:00.000Z',
      maxRuns: overrides.maxRuns ?? 2,
      maxInputCharacters: overrides.maxInputCharacters ?? 200_000
    }]
  })
}

describe('invite access policy', () => {
  it('stores only a keyed digest of the invite code', async () => {
    const store = policy()

    expect(store.snapshot()).not.toContain(rawCode)
    expect(store.snapshot()).toContain(await digestInviteCode(rawCode, pepper))
  })

  it('authorizes an enabled unexpired code and records aggregate usage', async () => {
    const store = policy()

    const grant = await store.authorize({
      code: rawCode,
      ipAddress: '203.0.113.10',
      inputCharacters: 42_000
    })
    await store.recordUsage(grant, {
      status: 'success',
      inputTokens: 11_000,
      outputTokens: 2_000,
      latencyMs: 810
    })

    expect(grant).toMatchObject({ inviteId: 'mac-lab-pilot', remainingRuns: 1 })
    expect(store.usageFor('mac-lab-pilot')).toEqual({
      attempts: 1,
      successes: 1,
      failures: 0,
      inputCharacters: 42_000,
      inputTokens: 11_000,
      outputTokens: 2_000,
      latencyMs: 810
    })
  })

  it.each([
    ['invalid code', 'wrong-code', policy(), 401, 'INVITE_INVALID'],
    ['disabled code', rawCode, policy({ enabled: false }), 401, 'INVITE_DISABLED'],
    ['expired code', rawCode, policy({ expiresAt: '2026-07-19T00:00:00.000Z' }), 401, 'INVITE_EXPIRED'],
    ['oversized paper', rawCode, policy({ maxInputCharacters: 10 }), 413, 'INVITE_INPUT_LIMIT']
  ])('rejects %s', async (_label, code, store, status, errorCode) => {
    await expect(store.authorize({
      code,
      ipAddress: '203.0.113.10',
      inputCharacters: 42_000
    })).rejects.toMatchObject({
      status: status as InviteAccessError['status'],
      code: errorCode as InviteAccessError['code']
    })
  })

  it('reserves quota atomically under concurrent use', async () => {
    const store = policy({ maxRuns: 1 })
    const attempt = () => store.authorize({
      code: rawCode,
      ipAddress: '203.0.113.10',
      inputCharacters: 42_000
    })

    const results = await Promise.allSettled([attempt(), attempt()])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejection = results.find(result => result.status === 'rejected') as PromiseRejectedResult
    expect(rejection.reason).toMatchObject({ status: 429, code: 'INVITE_EXHAUSTED' })
  })
})
