import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import {
  InMemoryInvitePolicy,
  unavailableInvitePolicy,
  type InvitePolicy
} from './invitePolicy'
import { UpstashInvitePolicy } from './upstashInvitePolicy'

function positiveInteger(value: string | undefined, fallback: number): number {
  const candidate = Number(value)
  return Number.isInteger(candidate) && candidate > 0 ? candidate : fallback
}

export function createInvitePolicyFromEnvironment(): InvitePolicy {
  const mode = process.env.MAC_INVITE_POLICY ?? 'disabled'
  if (mode === 'disabled') return unavailableInvitePolicy('Invite access is not configured')

  const pepper = process.env.MAC_INVITE_HASH_PEPPER
  if (!pepper) return unavailableInvitePolicy('Invite access is incomplete')

  if (mode === 'static') {
    if (process.env.VERCEL_ENV === 'production') {
      return unavailableInvitePolicy('Static invite access is disabled in production')
    }
    const code = process.env.MAC_BENCH_ACCESS_TOKEN
    if (!code) return unavailableInvitePolicy('Static invite access is incomplete')
    return InMemoryInvitePolicy.fromPlaintextCodes({
      pepper,
      invites: [{
        code,
        id: 'local-static',
        label: 'Local static invite',
        enabled: true,
        expiresAt: '2100-01-01T00:00:00.000Z',
        maxRuns: positiveInteger(process.env.MAC_INVITE_MAX_RUNS, 20),
        maxInputCharacters: positiveInteger(process.env.MAC_INVITE_MAX_INPUT_CHARACTERS, 200_000)
      }]
    })
  }

  if (mode !== 'upstash') return unavailableInvitePolicy('Invite access policy is invalid')
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return unavailableInvitePolicy('Upstash invite access is incomplete')

  const redis = new Redis({ url, token })
  const rateLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(
      positiveInteger(process.env.MAC_INVITE_IP_REQUESTS, 10),
      '10 m'
    ),
    analytics: false,
    prefix: 'cylon:invite:ip'
  })
  return new UpstashInvitePolicy({ redis, rateLimiter, pepper })
}
