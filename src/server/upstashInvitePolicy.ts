import type { InviteAuthorization, InviteGrant, InvitePolicy, InviteUsage } from './invitePolicy'
import { digestInviteCode, InviteAccessError } from './invitePolicy'

interface RedisClient {
  eval<TArgs extends unknown[], TResult>(script: string, keys: string[], args: TArgs): Promise<TResult>
}

interface RateLimiter {
  limit(identifier: string): Promise<{ success: boolean }>
}

interface UpstashInvitePolicyOptions {
  redis: RedisClient
  rateLimiter: RateLimiter
  pepper: string
  now?: () => Date
}

const reserveInviteScript = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then return {'INVALID'} end
if redis.call('HGET', key, 'enabled') ~= 'true' then return {'DISABLED'} end
local expiresAt = tonumber(redis.call('HGET', key, 'expiresAt') or '0')
if expiresAt <= tonumber(ARGV[1]) then return {'EXPIRED'} end
local maxInputCharacters = tonumber(redis.call('HGET', key, 'maxInputCharacters') or '0')
if tonumber(ARGV[2]) > maxInputCharacters then return {'INPUT_LIMIT'} end
local maxRuns = tonumber(redis.call('HGET', key, 'maxRuns') or '0')
local usedRuns = tonumber(redis.call('HGET', key, 'usedRuns') or '0')
if usedRuns >= maxRuns then return {'EXHAUSTED'} end
local nextUsedRuns = redis.call('HINCRBY', key, 'usedRuns', 1)
redis.call('HINCRBY', key, 'attempts', 1)
redis.call('HINCRBY', key, 'inputCharacters', tonumber(ARGV[2]))
local inviteId = redis.call('HGET', key, 'id') or ''
return {'OK', inviteId, tostring(maxRuns - nextUsedRuns)}
`

const recordUsageScript = `
local key = KEYS[1]
if redis.call('EXISTS', key) == 0 then return 'MISSING' end
if ARGV[1] == 'success' then
  redis.call('HINCRBY', key, 'successes', 1)
else
  redis.call('HINCRBY', key, 'failures', 1)
end
redis.call('HINCRBY', key, 'inputTokens', tonumber(ARGV[2]))
redis.call('HINCRBY', key, 'outputTokens', tonumber(ARGV[3]))
redis.call('HINCRBY', key, 'latencyMs', tonumber(ARGV[4]))
return 'OK'
`

const resultErrors: Record<string, InviteAccessError> = {
  INVALID: new InviteAccessError('Analysis access denied', 401, 'INVITE_INVALID'),
  DISABLED: new InviteAccessError('This invite is disabled', 401, 'INVITE_DISABLED'),
  EXPIRED: new InviteAccessError('This invite has expired', 401, 'INVITE_EXPIRED'),
  EXHAUSTED: new InviteAccessError('This invite has no live runs remaining', 429, 'INVITE_EXHAUSTED'),
  INPUT_LIMIT: new InviteAccessError('This paper exceeds the invite input limit', 413, 'INVITE_INPUT_LIMIT')
}

export class UpstashInvitePolicy implements InvitePolicy {
  private readonly redis: RedisClient
  private readonly rateLimiter: RateLimiter
  private readonly pepper: string
  private readonly now: () => Date

  constructor(options: UpstashInvitePolicyOptions) {
    this.redis = options.redis
    this.rateLimiter = options.rateLimiter
    this.pepper = options.pepper
    this.now = options.now ?? (() => new Date())
  }

  async authorize(input: InviteAuthorization): Promise<InviteGrant> {
    const ipDigest = await digestInviteCode(input.ipAddress, this.pepper)
    try {
      const ipLimit = await this.rateLimiter.limit(`ip:${ipDigest}`)
      if (!ipLimit.success) {
        throw new InviteAccessError('Too many live analysis attempts', 429, 'INVITE_RATE_LIMITED')
      }
    } catch (error) {
      if (error instanceof InviteAccessError) throw error
      throw new InviteAccessError('Invite access is unavailable', 503, 'INVITE_UNAVAILABLE')
    }

    const codeDigest = await digestInviteCode(input.code, this.pepper)
    let result: string[]
    try {
      result = await this.redis.eval<[number, number], string[]>(
        reserveInviteScript,
        [`cylon:invite:${codeDigest}`],
        [this.now().getTime(), input.inputCharacters]
      )
    } catch {
      throw new InviteAccessError('Invite access is unavailable', 503, 'INVITE_UNAVAILABLE')
    }

    const [status, inviteId = '', remaining = '0'] = result
    const accessError = resultErrors[status]
    if (accessError) throw accessError
    if (status !== 'OK' || !inviteId) {
      throw new InviteAccessError('Invite access is unavailable', 503, 'INVITE_UNAVAILABLE')
    }
    return {
      inviteId,
      codeDigest,
      remainingRuns: Number(remaining),
      inputCharacters: input.inputCharacters
    }
  }

  async recordUsage(grant: InviteGrant, usage: InviteUsage): Promise<void> {
    await this.redis.eval<[InviteUsage['status'], number, number, number], string>(
      recordUsageScript,
      [`cylon:invite:${grant.codeDigest}`],
      [usage.status, usage.inputTokens, usage.outputTokens, Math.round(usage.latencyMs)]
    )
  }
}
