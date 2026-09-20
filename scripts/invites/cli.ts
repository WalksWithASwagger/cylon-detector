import { pathToFileURL } from 'node:url'
import {
  auditInviteStore,
  generateOpaqueInviteId,
  InviteToolError,
  planGlobalShutdown,
  planInviteDisable,
  prepareInviteDryRun,
  rejectMutatingMode
} from './provision'
import type { InviteRecordFields } from '../../src/server/invitePolicy'

export interface InviteCliIo {
  argv: string[]
  stdinText?: string
  env?: Record<string, string | undefined>
  stdout: (text: string) => void
  stderr: (text: string) => void
  stderrIsTty?: boolean
}

const USAGE = `Usage: npm run invites -- [dry-run|audit|disable|shutdown] [options]

Offline invite provisioning and audit. Default command is dry-run.
This tool never contacts Redis, Upstash, or any other vendor.

Commands:
  dry-run     Prepare a hashed invite record (default)
  audit       Report only safe configuration and aggregate counters
  disable     Prepare an enabled=false patch from a hashed record
  shutdown    Preview the global live-analysis shutdown

Dry-run options:
  --id <opaque-id>                 Optional operational ID (generated if omitted)
  --expires-at <iso|epoch-ms>      Required expiry
  --max-runs <n>                   Default 20
  --max-input-characters <n>       Default 200000
  --code-stdin                     Read an existing high-entropy code from stdin
  --pepper-stdin                   Read MAC_INVITE_HASH_PEPPER from stdin
  --handoff-stderr                 Required to generate a code; prints it once on a TTY stderr

Audit / disable options:
  --record-stdin                   Read a prepared plan, record list, or snapshot

Pepper is read from a Varlock-loaded MAC_INVITE_HASH_PEPPER or --pepper-stdin.
Raw codes and peppers are rejected as process arguments. Apply/write flags fail closed.
`

function printJson(io: InviteCliIo, value: unknown): void {
  io.stdout(`${JSON.stringify(value, null, 2)}\n`)
}

function readFlag(argv: string[], name: string): string | undefined {
  const equals = argv.find(arg => arg.startsWith(`${name}=`))
  if (equals) return equals.slice(name.length + 1)
  const index = argv.indexOf(name)
  if (index === -1) return undefined
  return argv[index + 1]
}

function hasFlag(argv: string[], name: string): boolean {
  return argv.includes(name) || argv.some(arg => arg.startsWith(`${name}=`))
}

const COMMANDS = new Set(['dry-run', 'audit', 'disable', 'shutdown'])

function parseCommand(argv: string[]): string {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('-')) {
      if (!arg.includes('=') && argv[index + 1] && !argv[index + 1].startsWith('-')) index += 1
      continue
    }
    if (COMMANDS.has(arg)) return arg
    throw new InviteToolError(`Unknown command: ${arg}`)
  }
  return 'dry-run'
}

function stripCommand(argv: string[], command: string): string[] {
  const index = argv.indexOf(command)
  if (index === -1) return argv
  return argv.filter((_, current) => current !== index)
}

function parseExpiresAt(raw: string | undefined): number {
  if (!raw) throw new InviteToolError('--expires-at is required for dry-run')
  if (/^\d+$/.test(raw)) return Number(raw)
  const parsed = Date.parse(raw)
  if (Number.isNaN(parsed)) throw new InviteToolError('--expires-at must be ISO-8601 or epoch milliseconds')
  return parsed
}

function parsePositiveInteger(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined) return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InviteToolError(`${label} must be a positive integer`)
  }
  return parsed
}

function resolvePepper(argv: string[], io: InviteCliIo, stdinUsedFor: 'code' | 'record' | null): string {
  if (hasFlag(argv, '--pepper-stdin')) {
    if (stdinUsedFor) {
      throw new InviteToolError('Cannot combine --pepper-stdin with another stdin flag; load the pepper through Varlock')
    }
    const pepper = io.stdinText?.trim()
    if (!pepper) throw new InviteToolError('Expected HMAC pepper on stdin')
    return pepper
  }
  const pepper = io.env?.MAC_INVITE_HASH_PEPPER
  if (!pepper) {
    throw new InviteToolError('HMAC pepper missing. Load MAC_INVITE_HASH_PEPPER through Varlock or pass --pepper-stdin')
  }
  return pepper
}

function resolveStdin(io: InviteCliIo, label: string): string {
  const text = io.stdinText?.trim()
  if (!text) throw new InviteToolError(`Expected ${label} on stdin`)
  return text
}

function parseRecordInput(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new InviteToolError('stdin must contain JSON for --record-stdin')
  }
}

function preparedFromUnknown(input: unknown): { redisKey: string; fields: InviteRecordFields } {
  const root = input && typeof input === 'object' && !Array.isArray(input)
    ? input as Record<string, unknown>
    : null
  if (!root) throw new InviteToolError('Disable requires a prepared dry-run plan on stdin')
  const fields = (root.fields && typeof root.fields === 'object' ? root.fields : root) as InviteRecordFields
  const redisKey = typeof root.redisKey === 'string' ? root.redisKey : ''
  if (!redisKey || !fields?.id) {
    throw new InviteToolError('Disable requires redisKey and fields from a prior dry-run')
  }
  return { redisKey, fields }
}

export async function runInviteCli(io: InviteCliIo): Promise<number> {
  try {
    const argv = io.argv
    rejectMutatingMode(argv)
    if (hasFlag(argv, '--help') || hasFlag(argv, '-h')) {
      io.stdout(USAGE)
      return 0
    }
    if (hasFlag(argv, '--code') || hasFlag(argv, '--pepper')) {
      throw new InviteToolError('Raw codes and peppers cannot be passed as process arguments')
    }

    const command = parseCommand(argv)
    const options = stripCommand(argv, command)

    if (command === 'shutdown') {
      printJson(io, planGlobalShutdown())
      return 0
    }

    if (command === 'audit') {
      if (!hasFlag(options, '--record-stdin')) {
        throw new InviteToolError('audit requires --record-stdin')
      }
      printJson(io, auditInviteStore(parseRecordInput(resolveStdin(io, 'audit records'))))
      return 0
    }

    if (command === 'disable') {
      if (!hasFlag(options, '--record-stdin')) {
        throw new InviteToolError('disable requires a hashed record on --record-stdin')
      }
      const parsed = parseRecordInput(resolveStdin(io, 'hashed invite record'))
      const requestedId = readFlag(options, '--id')
      const prepared = preparedFromUnknown(parsed)
      if (requestedId && requestedId !== prepared.fields.id) {
        throw new InviteToolError('Disable --id does not match the hashed record')
      }
      printJson(io, planInviteDisable(prepared))
      return 0
    }

    if (command !== 'dry-run') {
      throw new InviteToolError(`Unknown command: ${command}`)
    }

    const codeFromStdin = hasFlag(options, '--code-stdin')
    const pepper = resolvePepper(options, io, codeFromStdin ? 'code' : hasFlag(options, '--record-stdin') ? 'record' : null)
    const code = codeFromStdin ? resolveStdin(io, 'invite code') : undefined
    const result = prepareInviteDryRun({
      pepper,
      code,
      id: readFlag(options, '--id') ?? generateOpaqueInviteId(),
      expiresAtMs: parseExpiresAt(readFlag(options, '--expires-at')),
      maxRuns: parsePositiveInteger(readFlag(options, '--max-runs'), 20, '--max-runs'),
      maxInputCharacters: parsePositiveInteger(
        readFlag(options, '--max-input-characters'),
        200_000,
        '--max-input-characters'
      )
    })

    if (result.plaintextHandoff) {
      if (!hasFlag(options, '--handoff-stderr')) {
        throw new InviteToolError('Generating a code requires --handoff-stderr on a TTY, or pass an existing code with --code-stdin')
      }
      if (!io.stderrIsTty) {
        throw new InviteToolError('Refusing to write a raw invite code because stderr is not a TTY')
      }
    }
    printJson(io, result.plan)
    if (result.plaintextHandoff) {
      io.stderr(`INVITE_CODE_HANDOFF ${result.plaintextHandoff}\n`)
    }
    return 0
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invite tool failed'
    io.stderr(`${message}\n`)
    return error instanceof InviteToolError && error.code === 'INVITE_APPLY_FORBIDDEN' ? 2 : 1
  }
}

async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) return ''
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

async function main(): Promise<void> {
  const code = await runInviteCli({
    argv: process.argv.slice(2),
    stdinText: await readProcessStdin(),
    env: {
      MAC_INVITE_HASH_PEPPER: process.env.MAC_INVITE_HASH_PEPPER
    },
    stdout: text => process.stdout.write(text),
    stderr: text => process.stderr.write(text),
    stderrIsTty: Boolean(process.stderr.isTTY)
  })
  process.exitCode = code
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
