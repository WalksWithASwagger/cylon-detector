import { describe, expect, it } from 'vitest'
import { InviteAccessError } from '@/server/invitePolicy'
import { UpstashInvitePolicy } from '@/server/upstashInvitePolicy'

const inviteCode = 'cylon_invite_01KJ7J7H2YGXM8T7BNC2YN8N7K'
const pepper = 'test-only-pepper-that-never-ships'

class FakeRedis {
  readonly calls: Array<{ script: string; keys: string[]; args: unknown[] }> = []
  responses: unknown[] = []
  error?: Error

  async eval<TArgs extends unknown[], TResult>(script: string, keys: string[], args: TArgs): Promise<TResult> {
    this.calls.push({ script, keys, args })
    if (this.error) throw this.error
    return this.responses.shift() as TResult
  }
}

function policy(redis: FakeRedis, allowIp = true) {
  return new UpstashInvitePolicy({
    redis,
    rateLimiter: { limit: async () => ({ success: allowIp }) },
    pepper,
    now: () => new Date('2026-07-20T20:00:00.000Z')
  })
}

describe('Upstash invite policy', () => {
  it('authorizes through an atomic reservation without sending raw access data to Redis', async () => {
    const redis = new FakeRedis()
    redis.responses.push(['OK', 'mac-pilot', '4'])
    const store = policy(redis)

    const grant = await store.authorize({
      code: inviteCode,
      ipAddress: '203.0.113.22',
      inputCharacters: 84_000
    })

    expect(grant).toMatchObject({ inviteId: 'mac-pilot', remainingRuns: 4 })
    const payload = JSON.stringify(redis.calls)
    expect(payload).not.toContain(inviteCode)
    expect(payload).not.toContain('203.0.113.22')
    expect(redis.calls[0]?.keys[0]).toMatch(/^cylon:invite:[a-f0-9]{64}$/)
  })

  it.each([
    ['INVALID', 401, 'INVITE_INVALID'],
    ['DISABLED', 401, 'INVITE_DISABLED'],
    ['EXPIRED', 401, 'INVITE_EXPIRED'],
    ['EXHAUSTED', 429, 'INVITE_EXHAUSTED'],
    ['INPUT_LIMIT', 413, 'INVITE_INPUT_LIMIT']
  ])('maps atomic result %s to a stable API error', async (result, status, code) => {
    const redis = new FakeRedis()
    redis.responses.push([result])

    await expect(policy(redis).authorize({
      code: inviteCode,
      ipAddress: '203.0.113.22',
      inputCharacters: 84_000
    })).rejects.toMatchObject({
      status: status as InviteAccessError['status'],
      code: code as InviteAccessError['code']
    })
  })

  it('rejects an IP before touching the invite record', async () => {
    const redis = new FakeRedis()

    await expect(policy(redis, false).authorize({
      code: inviteCode,
      ipAddress: '203.0.113.22',
      inputCharacters: 84_000
    })).rejects.toMatchObject({ status: 429, code: 'INVITE_RATE_LIMITED' })
    expect(redis.calls).toHaveLength(0)
  })

  it('fails closed when Redis is unavailable', async () => {
    const redis = new FakeRedis()
    redis.error = new Error('connection failed')

    await expect(policy(redis).authorize({
      code: inviteCode,
      ipAddress: '203.0.113.22',
      inputCharacters: 84_000
    })).rejects.toMatchObject({ status: 503, code: 'INVITE_UNAVAILABLE' })
  })

  it('records only aggregate numeric usage against the digested invite key', async () => {
    const redis = new FakeRedis()
    redis.responses.push('OK')
    const store = policy(redis)

    await store.recordUsage({
      inviteId: 'mac-pilot',
      codeDigest: 'a'.repeat(64),
      remainingRuns: 4,
      inputCharacters: 84_000
    }, {
      status: 'success',
      inputTokens: 21_000,
      outputTokens: 3_000,
      latencyMs: 999.7
    })

    expect(redis.calls[0]).toMatchObject({
      keys: [`cylon:invite:${'a'.repeat(64)}`],
      args: ['success', 21000, 3000, 1000]
    })
  })
})
