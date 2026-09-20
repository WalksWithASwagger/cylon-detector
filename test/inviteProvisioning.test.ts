import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runInviteCli, type InviteCliIo } from '../scripts/invites/cli'
import {
  INVITE_APPLY_MODE_AVAILABLE,
  auditInviteStore,
  planGlobalShutdown,
  planInviteDisable,
  prepareInviteDryRun,
  rejectMutatingMode
} from '../scripts/invites/provision'
import {
  digestInviteCode,
  inviteStorageKey,
  type InviteRecordFields
} from '@/server/invitePolicy'

const rawCode = 'cylon_invite_01KJ7J7H2YGXM8T7BNC2YN8N7K'
const pepper = 'test-only-pepper-that-never-ships'
const expiresAtMs = Date.parse('2026-08-01T00:00:00.000Z')

const forbiddenEvidence = {
  ip: '203.0.113.10',
  paperIdentity: 'Dennett Consciousness Explained',
  sourceDigest: '4df227118712dfa6bd9c1ca6337c07bc4ef5f757f10e916d834dc36b636f68d6',
  findings: 'The model assigned a consciousness score',
  citations: 'p. 128 claims phenomenal overflow',
  reviewDecision: 'human revised the machine verdict to accepted'
}

const upstashSource = readFileSync(new URL('../src/server/upstashInvitePolicy.ts', import.meta.url), 'utf8')
const toolSources = [
  readFileSync(new URL('../scripts/invites/provision.ts', import.meta.url), 'utf8'),
  readFileSync(new URL('../scripts/invites/cli.ts', import.meta.url), 'utf8')
].join('\n')

function captureCli(argv: string[], extras: Partial<InviteCliIo> = {}) {
  const stdout: string[] = []
  const stderr: string[] = []
  return {
    stdout,
    stderr,
    io: {
      argv,
      stdinText: extras.stdinText,
      env: extras.env ?? { MAC_INVITE_HASH_PEPPER: pepper },
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
      stderrIsTty: extras.stderrIsTty
    } satisfies InviteCliIo
  }
}

function assertNoSensitiveMaterial(serialized: string, extra: string[] = []) {
  for (const value of [rawCode, pepper, ...Object.values(forbiddenEvidence), ...extra]) {
    expect(serialized).not.toContain(value)
  }
}

describe('invite dry-run provisioning', () => {
  beforeEach(() => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      throw new Error('dry-run attempted fetch')
    })
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('dry-run attempted http.request')
    })
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('dry-run attempted https.request')
    })
    vi.spyOn(net, 'connect').mockImplementation(() => {
      throw new Error('dry-run attempted net.connect')
    })
    vi.spyOn(fs, 'writeFile').mockImplementation(() => {
      throw new Error('dry-run attempted writeFile')
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('is dry-run by default and never applies a vendor write', async () => {
    expect(INVITE_APPLY_MODE_AVAILABLE).toBe(false)
    const result = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })

    expect(result.plan.mode).toBe('dry-run')
    expect(result.plan.applied).toBe(false)
    expect(result.plan.network).toBe('offline')
    expect(result.generatedCode).toBe(false)
    expect(result.plaintextHandoff).toBeNull()
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(http.request).not.toHaveBeenCalled()
    expect(https.request).not.toHaveBeenCalled()
    expect(net.connect).not.toHaveBeenCalled()
  })

  it('prepares only the hashed operational record with zeroed counters', async () => {
    const result = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })
    const digest = await digestInviteCode(rawCode, pepper)

    expect(result.plan.redisKey).toBe(inviteStorageKey(digest))
    expect(result.plan.redisKey).toBe(`cylon:invite:${digest}`)
    expect(upstashSource).toContain(`cylon:invite:\${codeDigest}`)
    expect(result.plan.fields).toEqual({
      id: 'mac-lab-pilot',
      enabled: 'true',
      expiresAt: String(expiresAtMs),
      maxRuns: '5',
      maxInputCharacters: '200000',
      usedRuns: '0',
      attempts: '0',
      successes: '0',
      failures: '0',
      inputCharacters: '0',
      inputTokens: '0',
      outputTokens: '0',
      latencyMs: '0'
    })
    expect(result.plan).toMatchInlineSnapshot(`
      {
        "applied": false,
        "fields": {
          "attempts": "0",
          "enabled": "true",
          "expiresAt": "1785542400000",
          "failures": "0",
          "id": "mac-lab-pilot",
          "inputCharacters": "0",
          "inputTokens": "0",
          "latencyMs": "0",
          "maxInputCharacters": "200000",
          "maxRuns": "5",
          "outputTokens": "0",
          "successes": "0",
          "usedRuns": "0",
        },
        "mode": "dry-run",
        "network": "offline",
        "redisKey": "cylon:invite:1fbfd0e3f840107092265f6fc172785d0acb3ddd68b88e25daf40399f26affe8",
      }
    `)
    assertNoSensitiveMaterial(JSON.stringify(result.plan))
  })

  it('generates a high-entropy code without persisting plaintext', () => {
    const result = prepareInviteDryRun({
      pepper,
      id: 'mac-lab-generated',
      expiresAtMs,
      maxRuns: 2,
      maxInputCharacters: 20_000
    })

    expect(result.generatedCode).toBe(true)
    expect(result.plaintextHandoff).toMatch(/^cylon_invite_[0-9a-f]{40}$/)
    expect(JSON.stringify(result.plan)).not.toContain(result.plaintextHandoff)
    expect(result.plan.fields.id).not.toContain(result.plaintextHandoff ?? '')
  })

  it('accepts a code from stdin and rejects code or pepper process arguments', async () => {
    const accepted = captureCli(
      ['dry-run', '--id', 'mac-lab-pilot', '--expires-at', '2026-08-01T00:00:00.000Z', '--code-stdin'],
      { stdinText: rawCode }
    )
    await expect(runInviteCli(accepted.io)).resolves.toBe(0)
    expect(accepted.io.argv.join(' ')).not.toContain(rawCode)
    expect(accepted.io.argv.join(' ')).not.toContain(pepper)
    expect(accepted.stdout.join('')).toContain('"mode": "dry-run"')
    assertNoSensitiveMaterial(accepted.stdout.join(''))

    const rejectedCode = captureCli(['dry-run', '--code', rawCode, '--expires-at', '2026-08-01T00:00:00.000Z'])
    await expect(runInviteCli(rejectedCode.io)).resolves.toBe(1)
    expect(rejectedCode.stderr.join('')).toMatch(/process arguments/)

    const rejectedPepper = captureCli(['dry-run', '--pepper', pepper, '--expires-at', '2026-08-01T00:00:00.000Z'])
    await expect(runInviteCli(rejectedPepper.io)).resolves.toBe(1)
  })

  it('refuses apply or write flags and has no vendor client', async () => {
    expect(() => rejectMutatingMode(['--apply'])).toThrow(/separately reviewed design/)
    const cli = captureCli(['--apply'])
    await expect(runInviteCli(cli.io)).resolves.toBe(2)
    expect(toolSources).not.toMatch(/@upstash\/redis|UPSTASH_REDIS_REST|fetch\(|https\.request/)
    expect(toolSources).not.toMatch(/['"]\.env(?:\.local)?['"]/)
  })

  it('audits only safe configuration and aggregate counters', () => {
    const prepared = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })
    const report = auditInviteStore({
      ...prepared.plan.fields,
      ...forbiddenEvidence,
      code: rawCode,
      codeDigest: prepared.plan.redisKey,
      label: 'Do not persist this'
    })

    expect(report).toEqual({
      mode: 'audit',
      applied: false,
      records: [{
        id: 'mac-lab-pilot',
        enabled: true,
        expiresAt: expiresAtMs,
        maxRuns: 5,
        usedRuns: 0,
        remainingRuns: 5,
        maxInputCharacters: 200_000,
        attempts: 0,
        successes: 0,
        failures: 0,
        inputCharacters: 0,
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: 0
      }]
    })
    expect(report).toMatchInlineSnapshot(`
      {
        "applied": false,
        "mode": "audit",
        "records": [
          {
            "attempts": 0,
            "enabled": true,
            "expiresAt": 1785542400000,
            "failures": 0,
            "id": "mac-lab-pilot",
            "inputCharacters": 0,
            "inputTokens": 0,
            "latencyMs": 0,
            "maxInputCharacters": 200000,
            "maxRuns": 5,
            "outputTokens": 0,
            "remainingRuns": 5,
            "successes": 0,
            "usedRuns": 0,
          },
        ],
      }
    `)
    assertNoSensitiveMaterial(JSON.stringify(report), [prepared.plan.redisKey])
  })

  it('disables and previews global shutdown without the raw code', () => {
    const prepared = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })
    const disabled = planInviteDisable({
      redisKey: prepared.plan.redisKey,
      fields: prepared.plan.fields
    })
    const shutdown = planGlobalShutdown()

    expect(disabled.applied).toBe(false)
    expect(disabled.fields.enabled).toBe('false')
    expect(disabled.fields.id).toBe('mac-lab-pilot')
    expect(disabled.redisKey).toBe(prepared.plan.redisKey)
    expect(shutdown).toEqual({
      mode: 'shutdown',
      applied: false,
      network: 'offline',
      setting: 'MAC_LIVE_ANALYSIS_ENABLED',
      value: 'false',
      localRehearsalPreserved: true,
      requiresRawInviteCode: false
    })
    assertNoSensitiveMaterial(JSON.stringify({ disabled, shutdown }))
  })

  it('runs disable and shutdown through the CLI without argv secrets', async () => {
    const prepared = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })
    const disable = captureCli(['disable', '--record-stdin', '--id', 'mac-lab-pilot'], {
      stdinText: JSON.stringify(prepared.plan)
    })
    await expect(runInviteCli(disable.io)).resolves.toBe(0)
    expect(disable.stdout.join('')).toContain('"enabled": "false"')
    expect(disable.io.argv.join(' ')).not.toContain(rawCode)

    const shutdown = captureCli(['shutdown'])
    await expect(runInviteCli(shutdown.io)).resolves.toBe(0)
    expect(shutdown.stdout.join('')).toContain('MAC_LIVE_ANALYSIS_ENABLED')
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('keeps generated-code handoff off durable stdout and non-TTY stderr', async () => {
    const missingFlag = captureCli(
      ['dry-run', '--id', 'mac-lab-pilot', '--expires-at', '2026-08-01T00:00:00.000Z'],
      { stderrIsTty: true }
    )
    await expect(runInviteCli(missingFlag.io)).resolves.toBe(1)
    expect(missingFlag.stdout.join('')).toBe('')

    const blocked = captureCli(
      ['dry-run', '--id', 'mac-lab-pilot', '--expires-at', '2026-08-01T00:00:00.000Z', '--handoff-stderr'],
      { stderrIsTty: false }
    )
    await expect(runInviteCli(blocked.io)).resolves.toBe(1)
    expect(blocked.stdout.join('')).toBe('')

    const shown = captureCli(
      ['dry-run', '--id', 'mac-lab-pilot', '--expires-at', '2026-08-01T00:00:00.000Z', '--handoff-stderr'],
      { stderrIsTty: true }
    )
    await expect(runInviteCli(shown.io)).resolves.toBe(0)
    expect(shown.stderr.join('')).toMatch(/^INVITE_CODE_HANDOFF cylon_invite_[0-9a-f]{40}\n$/)
    assertNoSensitiveMaterial(shown.stdout.join(''), [shown.stderr.join().replace('INVITE_CODE_HANDOFF ', '').trim()])
  })

  it('audits an in-memory snapshot without leaking digests or labels', () => {
    const report = auditInviteStore({
      invites: [{
        id: 'mac-lab-pilot',
        label: 'MAC Lab pilot',
        enabled: true,
        expiresAt: '2026-08-01T00:00:00.000Z',
        maxRuns: 2,
        maxInputCharacters: 200000,
        codeDigest: 'a'.repeat(64),
        usedRuns: 1
      }],
      usage: {
        'mac-lab-pilot': {
          attempts: 1,
          successes: 1,
          failures: 0,
          inputCharacters: 42_000,
          inputTokens: 11_000,
          outputTokens: 2_000,
          latencyMs: 810
        }
      }
    })

    expect(report.records).toEqual([{
      id: 'mac-lab-pilot',
      enabled: true,
      expiresAt: expiresAtMs,
      maxRuns: 2,
      usedRuns: 1,
      remainingRuns: 1,
      maxInputCharacters: 200000,
      attempts: 1,
      successes: 1,
      failures: 0,
      inputCharacters: 42_000,
      inputTokens: 11_000,
      outputTokens: 2_000,
      latencyMs: 810
    }])
    expect(JSON.stringify(report)).not.toContain('MAC Lab pilot')
    expect(JSON.stringify(report)).not.toContain('a'.repeat(64))
  })
})

describe('invite record field contract', () => {
  it('does not accept identifying invite IDs', () => {
    expect(() => prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'reviewer@example.com',
      expiresAtMs,
      maxRuns: 1,
      maxInputCharacters: 1000
    })).toThrow(/opaque/)
  })

  it('keeps disable output assignable as a Redis hash', () => {
    const prepared = prepareInviteDryRun({
      pepper,
      code: rawCode,
      id: 'mac-lab-pilot',
      expiresAtMs,
      maxRuns: 5,
      maxInputCharacters: 200_000
    })
    const disabled = planInviteDisable({
      redisKey: prepared.plan.redisKey,
      fields: prepared.plan.fields
    })
    const fields: InviteRecordFields = disabled.fields
    expect(fields.enabled).toBe('false')
    expect(Object.keys(fields).sort()).toEqual([
      'attempts',
      'enabled',
      'expiresAt',
      'failures',
      'id',
      'inputCharacters',
      'inputTokens',
      'latencyMs',
      'maxInputCharacters',
      'maxRuns',
      'outputTokens',
      'successes',
      'usedRuns'
    ])
  })
})
