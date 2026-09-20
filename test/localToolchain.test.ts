import { describe, expect, it } from 'vitest'
import {
  CANONICAL_REPOSITORY,
  EXPLICIT_GH_REPOSITORY,
  LOCAL_VARLOCK_LOAD,
  NODE22_INVOCATION,
  collectLocalToolchainSnapshot,
  formatToolchainReport,
  githubRepositoryFromRemote,
  inspectLocalToolchain,
  parseNodeMajor,
  resolveStandaloneBinary,
  type CommandResult,
  type ToolchainIO,
  type ToolchainSnapshot
} from '../scripts/validate-local-toolchain'

function healthySnapshot(overrides: Partial<ToolchainSnapshot> = {}): ToolchainSnapshot {
  return {
    nodeVersion: 'v22.14.0',
    nvmrc: '22.12.0',
    enginesNode: '22.x',
    pinnedVarlock: '1.11.0',
    localVarlock: '1.11.0',
    standaloneVarlock: '1.11.0',
    standaloneAvailable: true,
    branchMasterRemote: 'origin',
    originUrl: `https://github.com/${CANONICAL_REPOSITORY}.git`,
    remotes: [
      {
        name: 'origin',
        url: `https://github.com/${CANONICAL_REPOSITORY}.git`,
        ghResolved: null
      }
    ],
    ghAvailable: true,
    ghRepoEnv: null,
    ...overrides
  }
}

function recordedIO(config: Record<string, string>, versions: Record<string, string> = {}): {
  io: ToolchainIO
  commands: string[]
} {
  const commands: string[] = []
  const standalonePath = versions.standaloneMissing ? null : '/usr/local/bin/varlock'
  const io: ToolchainIO = {
    repositoryRoot: '/repo',
    nodeVersion: versions.node ?? 'v22.14.0',
    env: versions.GH_REPO ? { GH_REPO: versions.GH_REPO } : {},
    async readText(path: string) {
      if (path.endsWith('.nvmrc')) return '22.12.0\n'
      if (path.endsWith('node_modules/varlock/package.json')) {
        return JSON.stringify({ version: versions.localVarlock ?? '1.11.0' })
      }
      if (path.endsWith('package.json')) {
        return JSON.stringify({
          engines: { node: '22.x' },
          devDependencies: { varlock: '1.11.0' }
        })
      }
      throw new Error(`unexpected path ${path}`)
    },
    async resolveStandalone(name: string) {
      return name === 'varlock' ? standalonePath : null
    },
    async run(command: string, args: string[]) {
      const invocation = `${command} ${args.join(' ')}`
      commands.push(invocation)
      expect(invocation).not.toMatch(/config --(?:add|unset|replace|remove)|repo set-default|auth login|api |pr create|issue create/)
      const stdout = (() => {
        if (command === 'git' && args.includes('branch.master.remote')) return config['branch.master.remote'] ?? ''
        if (command === 'git' && args.includes('remote.origin.url')) return config['remote.origin.url'] ?? ''
        if (command === 'git' && args.some(arg => arg.includes('\\.url$'))) return config['remote-urls'] ?? ''
        if (command === 'git' && args.some(arg => arg.includes('gh-resolved'))) return config['remote-resolved'] ?? ''
        if (command === standalonePath) return versions.standaloneVarlock ?? '1.11.0\n'
        if (command === 'gh') return 'gh version 2.99.0\n'
        return ''
      })()
      const missing = (command === 'gh' && versions.ghMissing)
        || (command === 'git' && stdout === '')
      return { stdout, stderr: missing ? 'not found' : '', status: missing ? 1 : 0 } satisfies CommandResult
    }
  }
  return { io, commands }
}

describe('local toolchain preflight', () => {
  it('passes a healthy Node 22, matching Varlock, and origin-only GitHub context', () => {
    const report = inspectLocalToolchain(healthySnapshot())
    const rendered = formatToolchainReport(report)

    expect(report.ok).toBe(true)
    expect(report.checks.map(check => [check.id, check.status])).toEqual([
      ['node', 'pass'],
      ['varlock', 'pass'],
      ['git-remote', 'pass'],
      ['gh-context', 'pass']
    ])
    expect(rendered).toContain('Preflight passed.')
    expect(rendered).toContain(`${NODE22_INVOCATION} node --version`)
    expect(rendered).toContain(LOCAL_VARLOCK_LOAD)
    expect(rendered).toContain(`${EXPLICIT_GH_REPOSITORY} issue list`)
  })

  it('fails when the active Node major does not match .nvmrc and package.json', () => {
    const report = inspectLocalToolchain(healthySnapshot({ nodeVersion: 'v26.0.1' }))

    expect(report.ok).toBe(false)
    const node = report.checks.find(check => check.id === 'node')
    expect(node?.status).toBe('fail')
    expect(node?.detail).toContain('major 26')
    expect(node?.detail).toContain('major 22')
    expect(node?.detail).toContain('.nvmrc 22.12.0')
    expect(node?.detail).toContain('engines.node 22.x')
    expect(node?.command).toBe(`${NODE22_INVOCATION} node --version`)
  })

  it('fails when standalone Varlock differs from the project-local pin and recommends npm exec', () => {
    const report = inspectLocalToolchain(healthySnapshot({
      standaloneVarlock: '1.10.0',
      standaloneAvailable: true,
      localVarlock: '1.11.0',
      pinnedVarlock: '1.11.0'
    }))

    expect(report.ok).toBe(false)
    const varlock = report.checks.find(check => check.id === 'varlock')
    expect(varlock?.status).toBe('fail')
    expect(varlock?.detail).toContain('1.10.0')
    expect(varlock?.detail).toContain('1.11.0')
    expect(varlock?.command).toBe(LOCAL_VARLOCK_LOAD)
    expect(formatToolchainReport(report)).not.toMatch(/npm i(?:nstall)? -g|corepack|brew install/)
  })

  it('fails when origin is not WalksWithASwagger/cylon-detector', () => {
    const report = inspectLocalToolchain(healthySnapshot({
      originUrl: 'https://github.com/TolgaB/consciousness-atlas.git',
      remotes: [
        {
          name: 'origin',
          url: 'https://github.com/TolgaB/consciousness-atlas.git',
          ghResolved: null
        }
      ]
    }))

    expect(report.ok).toBe(false)
    const remote = report.checks.find(check => check.id === 'git-remote')
    expect(remote?.status).toBe('fail')
    expect(remote?.detail).toContain('TolgaB/consciousness-atlas')
    expect(remote?.command).toBe(EXPLICIT_GH_REPOSITORY)
    expect(formatToolchainReport(report)).not.toMatch(/git remote (?:add|remove|set-url)|git config --unset/)
  })

  it('fails when upstream is the GitHub CLI default and prints an explicit -R command', () => {
    const report = inspectLocalToolchain(healthySnapshot({
      remotes: [
        {
          name: 'origin',
          url: `https://github.com/${CANONICAL_REPOSITORY}.git`,
          ghResolved: null
        },
        {
          name: 'upstream',
          url: 'https://github.com/TolgaB/consciousness-atlas.git',
          ghResolved: 'base'
        }
      ]
    }))

    expect(report.ok).toBe(false)
    const gh = report.checks.find(check => check.id === 'gh-context')
    expect(gh?.status).toBe('fail')
    expect(gh?.detail).toContain('remote.upstream.gh-resolved=base')
    expect(gh?.detail).toContain('TolgaB/consciousness-atlas')
    expect(gh?.command).toBe(`${EXPLICIT_GH_REPOSITORY} issue list`)
    expect(formatToolchainReport(report)).not.toMatch(/gh repo set-default|git config --unset/)
  })

  it('treats missing optional tools as diagnostics instead of throwing', () => {
    const report = inspectLocalToolchain(healthySnapshot({
      standaloneAvailable: false,
      standaloneVarlock: null,
      localVarlock: null,
      ghAvailable: false
    }))

    expect(report.ok).toBe(true)
    expect(report.checks.find(check => check.id === 'varlock')?.status).toBe('diagnostic')
    expect(report.checks.find(check => check.id === 'gh-context')?.status).toBe('diagnostic')
    expect(report.checks.find(check => check.id === 'varlock')?.command).toBe(LOCAL_VARLOCK_LOAD)
  })

  it('collects a snapshot from injected command and file fixtures without network access', async () => {
    const { io, commands } = recordedIO({
      'branch.master.remote': 'origin',
      'remote.origin.url': `https://github.com/${CANONICAL_REPOSITORY}.git`,
      'remote-urls': `remote.origin.url https://github.com/${CANONICAL_REPOSITORY}.git\nremote.upstream.url https://github.com/TolgaB/consciousness-atlas.git\n`,
      'remote-resolved': 'remote.upstream.gh-resolved base\n'
    }, { standaloneVarlock: '1.10.0\n' })

    const snapshot = await collectLocalToolchainSnapshot(io)
    const report = inspectLocalToolchain(snapshot)

    expect(snapshot.nodeVersion).toBe('v22.14.0')
    expect(snapshot.pinnedVarlock).toBe('1.11.0')
    expect(snapshot.standaloneVarlock).toBe('1.10.0')
    expect(snapshot.branchMasterRemote).toBe('origin')
    expect(snapshot.remotes).toEqual([
      {
        name: 'origin',
        url: `https://github.com/${CANONICAL_REPOSITORY}.git`,
        ghResolved: null
      },
      {
        name: 'upstream',
        url: 'https://github.com/TolgaB/consciousness-atlas.git',
        ghResolved: 'base'
      }
    ])
    expect(report.ok).toBe(false)
    expect(commands.every(command => (
      command.startsWith('git config --get')
      || command === '/usr/local/bin/varlock --version'
      || command === 'gh --version'
    ))).toBe(true)
    expect(commands.some(command => command.includes('--get-regexp'))).toBe(true)
  })

  it('ignores project-local node_modules when resolving standalone Varlock', async () => {
    const standalone = await resolveStandaloneBinary(
      'varlock',
      '/repo',
      '/repo/node_modules/.bin:/opt/missing/bin'
    )
    expect(standalone).toBeNull()
  })

  it('parses GitHub remotes and Node majors from the operator-facing forms', () => {
    expect(parseNodeMajor('v26.0.1')).toBe(26)
    expect(parseNodeMajor('22.x')).toBe(22)
    expect(githubRepositoryFromRemote(`git@github.com:${CANONICAL_REPOSITORY}.git`)).toBe(CANONICAL_REPOSITORY)
    expect(githubRepositoryFromRemote(`https://x-access-token:redacted@github.com/${CANONICAL_REPOSITORY}`)).toBe(CANONICAL_REPOSITORY)
  })
})
