import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import { access, readFile } from 'node:fs/promises'
import { delimiter, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const CANONICAL_REPOSITORY = 'WalksWithASwagger/cylon-detector'
export const NODE22_INVOCATION = 'PATH=/opt/homebrew/opt/node@22/bin:$PATH'
export const LOCAL_VARLOCK_LOAD = `${NODE22_INVOCATION} npm exec -- varlock load --agent --show-all`
export const LOCAL_VARLOCK_SCAN = `${NODE22_INVOCATION} npm exec -- varlock scan --staged`
export const EXPLICIT_GH_REPOSITORY = `gh -R ${CANONICAL_REPOSITORY}`

export type CheckStatus = 'pass' | 'fail' | 'diagnostic'

export interface CommandResult {
  stdout: string
  stderr: string
  status: number
}

export interface GitRemote {
  name: string
  url: string | null
  ghResolved: string | null
}

export interface ToolchainSnapshot {
  nodeVersion: string
  nvmrc: string
  enginesNode: string
  pinnedVarlock: string
  localVarlock: string | null
  standaloneVarlock: string | null
  standaloneAvailable: boolean
  branchMasterRemote: string | null
  originUrl: string | null
  remotes: GitRemote[]
  ghAvailable: boolean
  ghRepoEnv: string | null
}

export interface ToolchainCheck {
  id: 'node' | 'varlock' | 'git-remote' | 'gh-context'
  status: CheckStatus
  title: string
  detail: string
  command?: string
}

export interface ToolchainReport {
  ok: boolean
  checks: ToolchainCheck[]
}

export interface ToolchainIO {
  readText(path: string): Promise<string>
  run(command: string, args: string[]): Promise<CommandResult>
  resolveStandalone?(name: string): Promise<string | null>
  env?: NodeJS.ProcessEnv
  nodeVersion?: string
  repositoryRoot?: string
}

const defaultRoot = fileURLToPath(new URL('..', import.meta.url))

export function parseNodeMajor(version: string): number | null {
  const match = version.trim().match(/v?(\d+)/)
  return match ? Number(match[1]) : null
}

export function parseDisplayedVersion(text: string): string | null {
  const match = text.match(/(\d+\.\d+\.\d+)/) ?? text.match(/(\d+\.\d+)/)
  return match ? match[1] : null
}

export function githubRepositoryFromRemote(url: string): string | null {
  const cleaned = url.trim().replace(/\.git$/i, '').replace(/\/+$/, '')
  const match = cleaned.match(/github\.com(?::|\/)([^/]+\/[^/#?]+)/i)
  return match ? match[1] : null
}

function repositoryFromLooseRef(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.includes('github.com')) return githubRepositoryFromRemote(trimmed)
  const match = trimmed.match(/^([\w.-]+\/[\w.-]+)$/)
  return match ? match[1] : null
}

function sameRepository(left: string | null, right: string): boolean {
  return left?.toLowerCase() === right.toLowerCase()
}

function projectLocalVarlock(snapshot: ToolchainSnapshot): string {
  return snapshot.localVarlock ?? snapshot.pinnedVarlock
}

function isInsideNodeModules(candidate: string, repositoryRoot: string): boolean {
  const nodeModules = resolve(repositoryRoot, 'node_modules')
  return candidate === nodeModules
    || candidate.startsWith(`${nodeModules}/`)
    || candidate.startsWith(`${nodeModules}\\`)
}

export function inspectLocalToolchain(snapshot: ToolchainSnapshot): ToolchainReport {
  const requiredMajor = parseNodeMajor(snapshot.nvmrc)
  const enginesMajor = parseNodeMajor(snapshot.enginesNode)
  const activeMajor = parseNodeMajor(snapshot.nodeVersion)
  const nodeAligned = requiredMajor !== null
    && enginesMajor !== null
    && requiredMajor === enginesMajor
    && activeMajor === requiredMajor

  const node: ToolchainCheck = nodeAligned
    ? {
        id: 'node',
        status: 'pass',
        title: 'Node',
        detail: `Active Node ${snapshot.nodeVersion.trim()} matches major ${requiredMajor} from .nvmrc ${snapshot.nvmrc.trim()} and package.json engines.node ${snapshot.enginesNode.trim()}.`,
        command: `${NODE22_INVOCATION} node --version`
      }
    : {
        id: 'node',
        status: 'fail',
        title: 'Node',
        detail: `Active Node is ${snapshot.nodeVersion.trim() || 'unknown'} (major ${activeMajor ?? 'unknown'}). Repository requires major ${requiredMajor ?? 'unknown'} (.nvmrc ${snapshot.nvmrc.trim() || 'missing'}, engines.node ${snapshot.enginesNode.trim() || 'missing'}).`,
        command: `${NODE22_INVOCATION} node --version`
      }

  const expectedVarlock = projectLocalVarlock(snapshot)
  const standaloneVersion = snapshot.standaloneVarlock
  const varlockMismatch = snapshot.standaloneAvailable
    && Boolean(standaloneVersion)
    && standaloneVersion !== expectedVarlock
  const varlock: ToolchainCheck = varlockMismatch
    ? {
        id: 'varlock',
        status: 'fail',
        title: 'Varlock',
        detail: `Standalone Varlock is ${standaloneVersion}; project-local Varlock is ${expectedVarlock} (package.json pin ${snapshot.pinnedVarlock}${snapshot.localVarlock ? `, node_modules ${snapshot.localVarlock}` : ''}). Use the project-local binary.`,
        command: LOCAL_VARLOCK_LOAD
      }
    : snapshot.standaloneAvailable
      ? {
          id: 'varlock',
          status: 'pass',
          title: 'Varlock',
          detail: `Standalone and project-local Varlock match at ${expectedVarlock}. Prefer the local invocation so a later global upgrade cannot silently change the room.`,
          command: LOCAL_VARLOCK_LOAD
        }
      : {
          id: 'varlock',
          status: 'diagnostic',
          title: 'Varlock',
          detail: `Standalone Varlock is not on PATH. Project pin is ${snapshot.pinnedVarlock}${snapshot.localVarlock ? `; installed local version is ${snapshot.localVarlock}` : ''}. Use the project-local invocation.`,
          command: LOCAL_VARLOCK_LOAD
        }

  const originRepository = snapshot.originUrl ? githubRepositoryFromRemote(snapshot.originUrl) : null
  const originOk = sameRepository(originRepository, CANONICAL_REPOSITORY)
  const masterTracksOrigin = snapshot.branchMasterRemote === 'origin'
  const gitRemote: ToolchainCheck = originOk && masterTracksOrigin
    ? {
        id: 'git-remote',
        status: 'pass',
        title: 'Git remotes',
        detail: `branch.master.remote=origin and origin is ${CANONICAL_REPOSITORY}.`,
        command: EXPLICIT_GH_REPOSITORY
      }
    : {
        id: 'git-remote',
        status: 'fail',
        title: 'Git remotes',
        detail: `Expected branch.master.remote=origin tracking ${CANONICAL_REPOSITORY}. Found branch.master.remote=${snapshot.branchMasterRemote ?? 'unset'} and origin ${snapshot.originUrl ?? 'unset'}${originRepository ? ` (${originRepository})` : ''}.`,
        command: EXPLICIT_GH_REPOSITORY
      }

  const resolvedRemote = snapshot.remotes.find(remote => remote.ghResolved === 'base')
  const resolvedRepository = resolvedRemote?.url ? githubRepositoryFromRemote(resolvedRemote.url) : null
  const resolvedAway = Boolean(resolvedRemote) && !sameRepository(resolvedRepository, CANONICAL_REPOSITORY)
  const envRepository = snapshot.ghRepoEnv ? repositoryFromLooseRef(snapshot.ghRepoEnv) : null
  const envAway = Boolean(snapshot.ghRepoEnv) && !sameRepository(envRepository, CANONICAL_REPOSITORY)
  const foreignRemotes = snapshot.remotes.filter(remote => {
    if (!remote.url) return false
    const repository = githubRepositoryFromRemote(remote.url)
    return Boolean(repository) && !sameRepository(repository, CANONICAL_REPOSITORY)
  })
  const ambiguousRemotes = foreignRemotes.length > 0 && (
    resolvedAway
    || !resolvedRemote
    || !sameRepository(resolvedRepository, CANONICAL_REPOSITORY)
  )

  let ghContext: ToolchainCheck
  if (resolvedAway) {
    ghContext = {
      id: 'gh-context',
      status: 'fail',
      title: 'GitHub CLI',
      detail: `remote.${resolvedRemote?.name}.gh-resolved=${resolvedRemote?.ghResolved} so unqualified gh may target ${resolvedRepository ?? resolvedRemote?.url ?? 'another repository'} instead of ${CANONICAL_REPOSITORY}.`,
      command: `${EXPLICIT_GH_REPOSITORY} issue list`
    }
  } else if (envAway) {
    ghContext = {
      id: 'gh-context',
      status: 'fail',
      title: 'GitHub CLI',
      detail: `GH_REPO=${snapshot.ghRepoEnv} so unqualified gh may target ${envRepository ?? snapshot.ghRepoEnv} instead of ${CANONICAL_REPOSITORY}.`,
      command: `${EXPLICIT_GH_REPOSITORY} issue list`
    }
  } else if (ambiguousRemotes) {
    const names = foreignRemotes.map(remote => remote.name).join(', ')
    ghContext = {
      id: 'gh-context',
      status: 'fail',
      title: 'GitHub CLI',
      detail: `Additional GitHub remotes (${names}) make unqualified gh ambiguous. Git still tracks master through origin; do not change remotes. Use an explicit repository flag.`,
      command: `${EXPLICIT_GH_REPOSITORY} issue list`
    }
  } else if (!snapshot.ghAvailable) {
    ghContext = {
      id: 'gh-context',
      status: 'diagnostic',
      title: 'GitHub CLI',
      detail: `gh is not on PATH. Git remotes look like ${CANONICAL_REPOSITORY}; if you install gh later, always pass -R.`,
      command: `${EXPLICIT_GH_REPOSITORY} issue list`
    }
  } else {
    ghContext = {
      id: 'gh-context',
      status: 'pass',
      title: 'GitHub CLI',
      detail: `No GitHub CLI default points away from ${CANONICAL_REPOSITORY}. Still prefer an explicit -R so a later gh-resolved remote cannot retarget commands.`,
      command: `${EXPLICIT_GH_REPOSITORY} issue list`
    }
  }

  const checks = [node, varlock, gitRemote, ghContext]
  return { ok: checks.every(check => check.status !== 'fail'), checks }
}

export function formatToolchainReport(report: ToolchainReport): string {
  const lines = ['Local toolchain preflight', '']
  for (const check of report.checks) {
    lines.push(`[${check.status}] ${check.title}`)
    lines.push(`  ${check.detail}`)
    if (check.command) lines.push(`  ${check.command}`)
    lines.push('')
  }
  lines.push(report.ok ? 'Preflight passed.' : 'Preflight failed.')
  return `${lines.join('\n')}\n`
}

async function readOptionalText(io: ToolchainIO, path: string): Promise<string | null> {
  try {
    return await io.readText(path)
  } catch {
    return null
  }
}

async function runOptional(io: ToolchainIO, command: string, args: string[]): Promise<CommandResult> {
  try {
    return await io.run(command, args)
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: string | number }
    if (err.code === 'ENOENT') {
      return { stdout: '', stderr: err.message, status: 127 }
    }
    return {
      stdout: typeof err.stdout === 'string' ? err.stdout : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : err.message,
      status: typeof err.code === 'number' ? err.code : 1
    }
  }
}

function parseGitConfigMap(stdout: string, suffix: string): Map<string, string> {
  const values = new Map<string, string>()
  for (const line of stdout.split('\n')) {
    const match = line.match(new RegExp(`^remote\\.(.+)\\.${suffix}\\s+(.+)$`))
    if (!match) continue
    values.set(match[1], match[2].trim())
  }
  return values
}

export async function resolveStandaloneBinary(
  name: string,
  repositoryRoot: string,
  pathEnv = process.env.PATH ?? ''
): Promise<string | null> {
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue
    const candidate = resolve(dir, name)
    if (isInsideNodeModules(candidate, repositoryRoot)) continue
    try {
      await access(candidate, constants.X_OK)
      return candidate
    } catch {
      continue
    }
  }
  return null
}

export async function collectLocalToolchainSnapshot(io: ToolchainIO): Promise<ToolchainSnapshot> {
  const root = io.repositoryRoot ?? defaultRoot
  const nvmrc = (await readOptionalText(io, resolve(root, '.nvmrc')))?.trim() ?? ''
  const packageRaw = await readOptionalText(io, resolve(root, 'package.json'))
  const packageJson = packageRaw ? JSON.parse(packageRaw) as {
    engines?: { node?: string }
    devDependencies?: { varlock?: string }
    dependencies?: { varlock?: string }
  } : {}
  const localRaw = await readOptionalText(io, resolve(root, 'node_modules/varlock/package.json'))
  const localJson = localRaw ? JSON.parse(localRaw) as { version?: string } : null
  const standalonePath = io.resolveStandalone
    ? await io.resolveStandalone('varlock')
    : await resolveStandaloneBinary('varlock', root, io.env?.PATH ?? process.env.PATH)
  const standalone = standalonePath
    ? await runOptional(io, standalonePath, ['--version'])
    : { stdout: '', stderr: 'standalone varlock not on PATH', status: 127 }
  const masterRemote = await runOptional(io, 'git', ['config', '--get', '--local', 'branch.master.remote'])
  const originUrl = await runOptional(io, 'git', ['config', '--get', '--local', 'remote.origin.url'])
  const remoteUrls = await runOptional(io, 'git', ['config', '--get-regexp', '--local', '^remote\\..*\\.url$'])
  const remoteResolved = await runOptional(io, 'git', ['config', '--get-regexp', '--local', '^remote\\..*\\.gh-resolved$'])
  const ghVersion = await runOptional(io, 'gh', ['--version'])

  const urls = parseGitConfigMap(remoteUrls.stdout, 'url')
  const resolved = parseGitConfigMap(remoteResolved.stdout, 'gh-resolved')
  const names = new Set([...urls.keys(), ...resolved.keys()])
  const remotes = [...names].sort().map(name => ({
    name,
    url: urls.get(name) ?? null,
    ghResolved: resolved.get(name) ?? null
  }))

  return {
    nodeVersion: io.nodeVersion ?? process.version,
    nvmrc,
    enginesNode: packageJson.engines?.node ?? '',
    pinnedVarlock: packageJson.devDependencies?.varlock
      ?? packageJson.dependencies?.varlock
      ?? '',
    localVarlock: localJson?.version ?? null,
    standaloneVarlock: standalone.status === 0 ? parseDisplayedVersion(standalone.stdout) : null,
    standaloneAvailable: standalone.status === 0,
    branchMasterRemote: masterRemote.status === 0 ? masterRemote.stdout.trim() || null : null,
    originUrl: originUrl.status === 0 ? originUrl.stdout.trim() || null : null,
    remotes,
    ghAvailable: ghVersion.status === 0,
    ghRepoEnv: io.env?.GH_REPO ?? null
  }
}

export async function createDefaultToolchainIO(repositoryRoot = defaultRoot): Promise<ToolchainIO> {
  return {
    repositoryRoot,
    nodeVersion: process.version,
    env: process.env,
    async readText(path: string) {
      return readFile(path, 'utf8')
    },
    async resolveStandalone(name: string) {
      return resolveStandaloneBinary(name, repositoryRoot, process.env.PATH)
    },
    async run(command: string, args: string[]) {
      try {
        const result = await execFileAsync(command, args, {
          encoding: 'utf8',
          timeout: 8_000,
          maxBuffer: 64 * 1024
        })
        return { stdout: result.stdout, stderr: result.stderr, status: 0 }
      } catch (error) {
        const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; status?: number }
        if (err.code === 'ENOENT') {
          return { stdout: '', stderr: err.message, status: 127 }
        }
        return {
          stdout: typeof err.stdout === 'string' ? err.stdout : '',
          stderr: typeof err.stderr === 'string' ? err.stderr : err.message,
          status: typeof err.status === 'number' ? err.status : 1
        }
      }
    }
  }
}

export async function runLocalToolchainPreflight(io?: ToolchainIO): Promise<ToolchainReport> {
  const snapshot = await collectLocalToolchainSnapshot(io ?? await createDefaultToolchainIO())
  return inspectLocalToolchain(snapshot)
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) {
  const report = await runLocalToolchainPreflight()
  process.stdout.write(formatToolchainReport(report))
  if (!report.ok) process.exitCode = 1
}
