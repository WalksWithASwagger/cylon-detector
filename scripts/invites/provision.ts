import { randomBytes } from 'node:crypto'
import {
  disableInviteRecord,
  hashedInviteRecord,
  INVITE_RECORD_FIELD_NAMES,
  type InviteRecordFields
} from '../../src/server/invitePolicy'

export const INVITE_APPLY_MODE_AVAILABLE = false
export const INVITE_CODE_PREFIX = 'cylon_invite_'
export const MIN_INVITE_CODE_LENGTH = 24
export const MIN_PEPPER_LENGTH = 32

const OPAQUE_ID_PATTERN = /^[a-z][a-z0-9._-]{1,63}$/
const FORBIDDEN_MUTATING_FLAGS = new Set([
  'apply',
  '--apply',
  '--commit',
  '--write',
  '--write-redis',
  '--output',
  '--redis'
])

const UNSAFE_AUDIT_KEYS = [
  'code',
  'inviteCode',
  'plaintext',
  'pepper',
  'label',
  'codeDigest',
  'redisKey',
  'ip',
  'ipAddress',
  'paper',
  'paperTitle',
  'paperIdentity',
  'sourceDigest',
  'findings',
  'citations',
  'reviewDecision',
  'reviewDecisions',
  'decision'
] as const

export class InviteToolError extends Error {
  readonly code: string

  constructor(message: string, code = 'INVITE_TOOL_INVALID') {
    super(message)
    this.name = 'InviteToolError'
    this.code = code
  }
}

export interface DryRunPrepareInput {
  pepper: string
  code?: string
  id?: string
  enabled?: boolean
  expiresAtMs: number
  maxRuns: number
  maxInputCharacters: number
}

export interface PreparedInvitePlan {
  mode: 'dry-run'
  applied: false
  network: 'offline'
  redisKey: string
  fields: InviteRecordFields
}

export interface DryRunPrepareResult {
  plan: PreparedInvitePlan
  generatedCode: boolean
  plaintextHandoff: string | null
}

export interface InviteAuditRecord {
  id: string
  enabled: boolean
  expiresAt: number
  maxRuns: number
  usedRuns: number
  remainingRuns: number
  maxInputCharacters: number
  attempts: number
  successes: number
  failures: number
  inputCharacters: number
  inputTokens: number
  outputTokens: number
  latencyMs: number
}

export interface InviteAuditReport {
  mode: 'audit'
  applied: false
  records: InviteAuditRecord[]
}

export interface DisableInvitePlan {
  mode: 'disable'
  applied: false
  network: 'offline'
  id: string
  redisKey: string
  fields: InviteRecordFields
}

export interface GlobalShutdownPlan {
  mode: 'shutdown'
  applied: false
  network: 'offline'
  setting: 'MAC_LIVE_ANALYSIS_ENABLED'
  value: 'false'
  localRehearsalPreserved: true
  requiresRawInviteCode: false
}

export function rejectMutatingMode(argv: string[]): void {
  for (const raw of argv) {
    const flag = raw.split('=')[0]
    if (FORBIDDEN_MUTATING_FLAGS.has(flag)) {
      throw new InviteToolError(
        'Apply or write mode is not implemented. A separately reviewed design is required before any vendor mutation.',
        'INVITE_APPLY_FORBIDDEN'
      )
    }
  }
}

export function generateInviteCode(): string {
  return `${INVITE_CODE_PREFIX}${randomBytes(20).toString('hex')}`
}

export function generateOpaqueInviteId(): string {
  return `inv_${randomBytes(16).toString('hex')}`
}

export function assertHighEntropyInviteCode(code: string): void {
  if (code.length < MIN_INVITE_CODE_LENGTH) {
    throw new InviteToolError(`Invite codes must be at least ${MIN_INVITE_CODE_LENGTH} characters`)
  }
  if (/\s/.test(code)) {
    throw new InviteToolError('Invite codes must not contain whitespace')
  }
}

export function assertPepper(pepper: string): void {
  if (pepper.length < MIN_PEPPER_LENGTH) {
    throw new InviteToolError(`HMAC pepper must be at least ${MIN_PEPPER_LENGTH} characters`)
  }
}

export function assertOpaqueInviteId(id: string, code?: string): void {
  if (!OPAQUE_ID_PATTERN.test(id)) {
    throw new InviteToolError('Invite IDs must be opaque operational tokens, not names or addresses')
  }
  if (id.includes('@')) {
    throw new InviteToolError('Invite IDs must not contain an email address')
  }
  if (code && (id === code || id.includes(code))) {
    throw new InviteToolError('Invite IDs must not contain the raw invite code')
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InviteToolError(`${label} must be a positive integer`)
  }
}

function assertEpochMs(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new InviteToolError('expiresAt must be a positive Unix epoch in milliseconds')
  }
}

export function prepareInviteDryRun(input: DryRunPrepareInput): DryRunPrepareResult {
  if (INVITE_APPLY_MODE_AVAILABLE) {
    throw new InviteToolError('Apply mode must remain mechanically impossible', 'INVITE_APPLY_FORBIDDEN')
  }
  assertPepper(input.pepper)
  assertPositiveInteger(input.maxRuns, 'maxRuns')
  assertPositiveInteger(input.maxInputCharacters, 'maxInputCharacters')
  assertEpochMs(input.expiresAtMs)

  const generatedCode = input.code === undefined
  const code = input.code ?? generateInviteCode()
  assertHighEntropyInviteCode(code)

  const id = input.id ?? generateOpaqueInviteId()
  assertOpaqueInviteId(id, code)

  const { redisKey, fields } = hashedInviteRecord({
    code,
    pepper: input.pepper,
    id,
    enabled: input.enabled,
    expiresAtMs: input.expiresAtMs,
    maxRuns: input.maxRuns,
    maxInputCharacters: input.maxInputCharacters
  })
  assertRecordHasOnlyAllowedFields(fields)

  return {
    plan: {
      mode: 'dry-run',
      applied: false,
      network: 'offline',
      redisKey,
      fields
    },
    generatedCode,
    plaintextHandoff: generatedCode ? code : null
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new InviteToolError(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function numericField(record: Record<string, unknown>, key: string, fallback = 0): number {
  const value = record[key]
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new InviteToolError(`Audit field ${key} must be numeric`)
  }
  return parsed
}

function parseExpiresAt(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    if (/^\d+$/.test(value)) return Number(value)
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
  }
  throw new InviteToolError('Audit records require an expiresAt epoch or ISO timestamp')
}

export function safeInviteAuditRecord(input: unknown): InviteAuditRecord {
  const record = asRecord(input, 'Audit record')
  const id = typeof record.id === 'string' ? record.id : ''
  if (!id) throw new InviteToolError('Audit records require an opaque id')

  const maxRuns = numericField(record, 'maxRuns')
  const usedRuns = numericField(record, 'usedRuns')
  const enabledValue = record.enabled
  const enabled = enabledValue === true || enabledValue === 'true'

  return {
    id,
    enabled,
    expiresAt: parseExpiresAt(record.expiresAt),
    maxRuns,
    usedRuns,
    remainingRuns: Math.max(0, maxRuns - usedRuns),
    maxInputCharacters: numericField(record, 'maxInputCharacters'),
    attempts: numericField(record, 'attempts'),
    successes: numericField(record, 'successes'),
    failures: numericField(record, 'failures'),
    inputCharacters: numericField(record, 'inputCharacters'),
    inputTokens: numericField(record, 'inputTokens'),
    outputTokens: numericField(record, 'outputTokens'),
    latencyMs: numericField(record, 'latencyMs')
  }
}

function auditEntriesFromUnknown(input: unknown): unknown[] {
  if (Array.isArray(input)) return input

  const root = asRecord(input, 'Audit input')
  if (Array.isArray(root.records)) return root.records
  if (root.fields && typeof root.fields === 'object') return [root.fields]
  if (typeof root.id === 'string') return [root]

  if (Array.isArray(root.invites)) {
    const usage = root.usage && typeof root.usage === 'object' && !Array.isArray(root.usage)
      ? root.usage as Record<string, unknown>
      : {}
    return root.invites.map(invite => {
      const record = asRecord(invite, 'Invite snapshot')
      const inviteUsage = usage[String(record.id)]
      return inviteUsage && typeof inviteUsage === 'object'
        ? { ...record, ...inviteUsage }
        : record
    })
  }

  throw new InviteToolError('Audit input must be a prepared plan, record list, or invite snapshot')
}

export function auditInviteStore(input: unknown): InviteAuditReport {
  const records = auditEntriesFromUnknown(input).map(safeInviteAuditRecord)
  const report: InviteAuditReport = {
    mode: 'audit',
    applied: false,
    records
  }

  const serialized = JSON.stringify(report)
  for (const key of UNSAFE_AUDIT_KEYS) {
    if (serialized.includes(`"${key}"`)) {
      throw new InviteToolError(`Audit report must not include ${key}`)
    }
  }
  return report
}

export function planInviteDisable(input: {
  redisKey: string
  fields: InviteRecordFields
}): DisableInvitePlan {
  if (!input.redisKey.startsWith('cylon:invite:')) {
    throw new InviteToolError('Disable plans require the hashed Redis key, not a raw invite code')
  }
  return {
    mode: 'disable',
    applied: false,
    network: 'offline',
    id: input.fields.id,
    redisKey: input.redisKey,
    fields: disableInviteRecord(input.fields)
  }
}

export function planGlobalShutdown(): GlobalShutdownPlan {
  return {
    mode: 'shutdown',
    applied: false,
    network: 'offline',
    setting: 'MAC_LIVE_ANALYSIS_ENABLED',
    value: 'false',
    localRehearsalPreserved: true,
    requiresRawInviteCode: false
  }
}

export function assertRecordHasOnlyAllowedFields(fields: InviteRecordFields): void {
  const keys = Object.keys(fields)
  const unexpected = keys.filter(key => !INVITE_RECORD_FIELD_NAMES.includes(key as typeof INVITE_RECORD_FIELD_NAMES[number]))
  if (unexpected.length > 0) {
    throw new InviteToolError(`Invite records may not include ${unexpected.join(', ')}`)
  }
}
