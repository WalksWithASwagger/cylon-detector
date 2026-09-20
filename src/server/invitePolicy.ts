import { createHmac, timingSafeEqual } from 'node:crypto'

export type InviteErrorCode =
  | 'INVITE_INVALID'
  | 'INVITE_DISABLED'
  | 'INVITE_EXPIRED'
  | 'INVITE_EXHAUSTED'
  | 'INVITE_INPUT_LIMIT'
  | 'INVITE_RATE_LIMITED'
  | 'INVITE_UNAVAILABLE'

export class InviteAccessError extends Error {
  readonly status: 401 | 413 | 429 | 503
  readonly code: InviteErrorCode

  constructor(
    message: string,
    status: 401 | 413 | 429 | 503,
    code: InviteErrorCode
  ) {
    super(message)
    this.name = 'InviteAccessError'
    this.status = status
    this.code = code
  }
}

export interface InviteAuthorization {
  code: string
  ipAddress: string
  inputCharacters: number
}

export interface InviteGrant {
  inviteId: string
  codeDigest: string
  remainingRuns: number
  inputCharacters: number
}

export interface InviteUsage {
  status: 'success' | 'failure'
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface InvitePolicy {
  authorize(input: InviteAuthorization): Promise<InviteGrant>
  recordUsage(grant: InviteGrant, usage: InviteUsage): Promise<void>
}

interface PlaintextInvite {
  code: string
  id: string
  label: string
  enabled: boolean
  expiresAt: string
  maxRuns: number
  maxInputCharacters: number
}

interface StoredInvite extends Omit<PlaintextInvite, 'code'> {
  codeDigest: string
  usedRuns: number
}

interface AggregateUsage {
  attempts: number
  successes: number
  failures: number
  inputCharacters: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

const emptyUsage = (): AggregateUsage => ({
  attempts: 0,
  successes: 0,
  failures: 0,
  inputCharacters: 0,
  inputTokens: 0,
  outputTokens: 0,
  latencyMs: 0
})

export const INVITE_STORAGE_PREFIX = 'cylon:invite:'

export const INVITE_RECORD_FIELD_NAMES = [
  'id',
  'enabled',
  'expiresAt',
  'maxRuns',
  'usedRuns',
  'maxInputCharacters',
  'attempts',
  'successes',
  'failures',
  'inputCharacters',
  'inputTokens',
  'outputTokens',
  'latencyMs'
] as const

export type InviteRecordFieldName = typeof INVITE_RECORD_FIELD_NAMES[number]

export type InviteRecordFields = {
  id: string
  enabled: 'true' | 'false'
  expiresAt: string
  maxRuns: string
  usedRuns: string
  maxInputCharacters: string
  attempts: string
  successes: string
  failures: string
  inputCharacters: string
  inputTokens: string
  outputTokens: string
  latencyMs: string
}

const digestPattern = /^[a-f0-9]{64}$/

export function digestInviteCodeSync(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('hex')
}

export async function digestInviteCode(code: string, pepper: string): Promise<string> {
  return digestInviteCodeSync(code, pepper)
}

export function inviteStorageKey(codeDigest: string): string {
  if (!digestPattern.test(codeDigest)) {
    throw new Error('Invite storage key requires a 64-character hex digest')
  }
  return `${INVITE_STORAGE_PREFIX}${codeDigest}`
}

export function zeroedInviteCounters(): Pick<
  InviteRecordFields,
  'usedRuns' | 'attempts' | 'successes' | 'failures' | 'inputCharacters' | 'inputTokens' | 'outputTokens' | 'latencyMs'
> {
  return {
    usedRuns: '0',
    attempts: '0',
    successes: '0',
    failures: '0',
    inputCharacters: '0',
    inputTokens: '0',
    outputTokens: '0',
    latencyMs: '0'
  }
}

export function hashedInviteRecord(input: {
  code: string
  pepper: string
  id: string
  enabled?: boolean
  expiresAtMs: number
  maxRuns: number
  maxInputCharacters: number
}): { redisKey: string; fields: InviteRecordFields } {
  const codeDigest = digestInviteCodeSync(input.code, input.pepper)
  return {
    redisKey: inviteStorageKey(codeDigest),
    fields: {
      id: input.id,
      enabled: input.enabled === false ? 'false' : 'true',
      expiresAt: String(input.expiresAtMs),
      maxRuns: String(input.maxRuns),
      maxInputCharacters: String(input.maxInputCharacters),
      ...zeroedInviteCounters()
    }
  }
}

export function disableInviteRecord(fields: InviteRecordFields): InviteRecordFields {
  return { ...fields, enabled: 'false' }
}

function sameDigest(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left)
  const rightBytes = Buffer.from(right)
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes)
}

export class InMemoryInvitePolicy implements InvitePolicy {
  private readonly invites: StoredInvite[]
  private readonly usage = new Map<string, AggregateUsage>()
  private readonly pepper: string
  private readonly now: () => Date

  private constructor(
    invites: StoredInvite[],
    pepper: string,
    now: () => Date
  ) {
    this.invites = invites
    this.pepper = pepper
    this.now = now
  }

  static fromPlaintextCodes(input: {
    pepper: string
    invites: PlaintextInvite[]
    now?: () => Date
  }): InMemoryInvitePolicy {
    const invites = input.invites.map(invite => ({
      ...invite,
      codeDigest: digestInviteCodeSync(invite.code, input.pepper),
      usedRuns: 0,
      code: undefined
    })).map(({ code: _code, ...invite }) => invite)
    return new InMemoryInvitePolicy(invites, input.pepper, input.now ?? (() => new Date()))
  }

  async authorize(input: InviteAuthorization): Promise<InviteGrant> {
    const codeDigest = await digestInviteCode(input.code, this.pepper)
    const invite = this.invites.find(candidate => sameDigest(candidate.codeDigest, codeDigest))
    if (!invite) throw new InviteAccessError('Analysis access denied', 401, 'INVITE_INVALID')
    if (!invite.enabled) throw new InviteAccessError('This invite is disabled', 401, 'INVITE_DISABLED')
    if (new Date(invite.expiresAt).getTime() <= this.now().getTime()) {
      throw new InviteAccessError('This invite has expired', 401, 'INVITE_EXPIRED')
    }
    if (input.inputCharacters > invite.maxInputCharacters) {
      throw new InviteAccessError('This paper exceeds the invite input limit', 413, 'INVITE_INPUT_LIMIT')
    }
    if (invite.usedRuns >= invite.maxRuns) {
      throw new InviteAccessError('This invite has no live runs remaining', 429, 'INVITE_EXHAUSTED')
    }

    invite.usedRuns += 1
    const aggregate = this.usage.get(invite.id) ?? emptyUsage()
    aggregate.attempts += 1
    aggregate.inputCharacters += input.inputCharacters
    this.usage.set(invite.id, aggregate)
    return {
      inviteId: invite.id,
      codeDigest: invite.codeDigest,
      remainingRuns: invite.maxRuns - invite.usedRuns,
      inputCharacters: input.inputCharacters
    }
  }

  async recordUsage(grant: InviteGrant, usage: InviteUsage): Promise<void> {
    const aggregate = this.usage.get(grant.inviteId) ?? emptyUsage()
    aggregate[usage.status === 'success' ? 'successes' : 'failures'] += 1
    aggregate.inputTokens += usage.inputTokens
    aggregate.outputTokens += usage.outputTokens
    aggregate.latencyMs += Math.round(usage.latencyMs)
    this.usage.set(grant.inviteId, aggregate)
  }

  usageFor(inviteId: string): AggregateUsage {
    return structuredClone(this.usage.get(inviteId) ?? emptyUsage())
  }

  snapshot(): string {
    return JSON.stringify({ invites: this.invites, usage: Object.fromEntries(this.usage) })
  }
}

export function unavailableInvitePolicy(message = 'Invite access is unavailable'): InvitePolicy {
  return {
    async authorize() {
      throw new InviteAccessError(message, 503, 'INVITE_UNAVAILABLE')
    },
    async recordUsage() {}
  }
}
