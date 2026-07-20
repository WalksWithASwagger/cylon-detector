import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { relative, resolve } from 'node:path'
import {
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema,
  type ChallengeDefinitionV2
} from '../src/bench/v2/contracts'
import { stableStringify } from '../src/bench/artifact'
import { resolveBenchmark } from '../src/bench/v2/registry'

const repositoryRoot = new URL('../', import.meta.url)
const benchmarkRoot = new URL('../benchmarks/', import.meta.url)

const allowedEditableTransitions = {
  draft: new Set(['draft', 'provisional', 'retired']),
  provisional: new Set(['provisional', 'published', 'retired'])
} as const

export function assertChallengeLifecycleTransition(
  previous: ChallengeDefinitionV2,
  next: ChallengeDefinitionV2,
  previousBytes = stableStringify(previous),
  nextBytes = stableStringify(next)
): void {
  const previousKey = `${previous.id}@${previous.version}`
  const nextKey = `${next.id}@${next.version}`
  if (previousKey !== nextKey) {
    throw new Error(`Cannot compare lifecycle history for ${previousKey} and ${nextKey}`)
  }

  if (previous.lifecycle === 'published' || previous.lifecycle === 'retired') {
    if (previousBytes !== nextBytes) {
      throw new Error(`${previous.lifecycle} challenge ${previousKey} is immutable; create a higher version`)
    }
    return
  }

  if (!allowedEditableTransitions[previous.lifecycle].has(next.lifecycle)) {
    throw new Error(`Invalid lifecycle transition for ${previousKey}: ${previous.lifecycle} -> ${next.lifecycle}`)
  }
}

export function assertInitialChallengeLifecycle(challenge: ChallengeDefinitionV2): void {
  if (challenge.lifecycle === 'draft') return
  if (challenge.lifecycle === 'retired' && challenge.supersedes) return
  throw new Error(
    `New challenge ${challenge.id}@${challenge.version} must start as draft, or be a retired tombstone with supersedes`
  )
}

export function assertReplacementLinks(challenges: ChallengeDefinitionV2[]): void {
  const byKey = new Map(challenges.map(challenge => [`${challenge.id}@${challenge.version}`, challenge]))

  for (const challenge of challenges) {
    if (!challenge.supersedes) continue
    const sourceKey = `${challenge.id}@${challenge.version}`
    const targetKey = `${challenge.supersedes.id}@${challenge.supersedes.version}`
    if (sourceKey === targetKey) throw new Error(`${sourceKey} cannot supersede itself`)
    if (challenge.id !== challenge.supersedes.id) {
      throw new Error(`${sourceKey} can supersede only an earlier version with the same challenge ID`)
    }

    const target = byKey.get(targetKey)
    if (!target) throw new Error(`Superseded challenge ${targetKey} does not exist`)
    if (target.lifecycle !== 'published' && target.lifecycle !== 'retired') {
      throw new Error(`${sourceKey} must supersede an immutable published or retired version`)
    }
    if (compareSemanticVersions(challenge.version, target.version) <= 0) {
      throw new Error(`${sourceKey} must use a newer semantic version than ${targetKey}`)
    }
  }

  for (const challenge of challenges) {
    if (challenge.supersedes) continue
    const sourceKey = `${challenge.id}@${challenge.version}`
    const hasEarlierVersion = challenges.some(candidate =>
      candidate.id === challenge.id && compareSemanticVersions(challenge.version, candidate.version) > 0
    )
    if (hasEarlierVersion) throw new Error(`${sourceKey} must declare supersedes`)
  }
}

function compareSemanticVersions(left: string, right: string): number {
  const leftVersion = parseSemanticVersion(left)
  const rightVersion = parseSemanticVersion(right)

  for (let index = 0; index < 3; index += 1) {
    const difference = leftVersion.core[index] - rightVersion.core[index]
    if (difference !== 0n) return difference > 0n ? 1 : -1
  }

  if (!leftVersion.prerelease && !rightVersion.prerelease) return 0
  if (!leftVersion.prerelease) return 1
  if (!rightVersion.prerelease) return -1

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index]
    const rightPart = rightVersion.prerelease[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue

    const leftNumber = /^\d+$/.test(leftPart) ? BigInt(leftPart) : undefined
    const rightNumber = /^\d+$/.test(rightPart) ? BigInt(rightPart) : undefined
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber > rightNumber ? 1 : -1
    if (leftNumber !== undefined) return -1
    if (rightNumber !== undefined) return 1
    return leftPart > rightPart ? 1 : -1
  }
  return 0
}

function parseSemanticVersion(version: string): {
  core: [bigint, bigint, bigint]
  prerelease?: string[]
} {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(version)
  if (!match) throw new Error(`Invalid semantic version: ${version}`)
  const prerelease = match[4]?.split('.')
  if (prerelease?.some(identifier => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith('0'))) {
    throw new Error(`Invalid semantic version: ${version}`)
  }
  return {
    core: [BigInt(match[1]), BigInt(match[2]), BigInt(match[3])],
    prerelease
  }
}

async function loadRegistry(): Promise<{
  challenges: ChallengeDefinitionV2[]
  benchmarks: ReturnType<typeof benchmarkDefinitionV2Schema.parse>[]
  challengeFiles: Map<string, { challenge: ChallengeDefinitionV2; bytes: string }>
}> {
  const entries = await readdir(benchmarkRoot, { recursive: true, withFileTypes: true })
  const jsonFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  const challenges: ChallengeDefinitionV2[] = []
  const benchmarks: ReturnType<typeof benchmarkDefinitionV2Schema.parse>[] = []
  const challengeFiles = new Map<string, { challenge: ChallengeDefinitionV2; bytes: string }>()

  for (const entry of jsonFiles) {
    const url = new URL(entry.parentPath.replace(`${benchmarkRoot.pathname}/`, '') + `/${entry.name}`, benchmarkRoot)
    const bytes = await readFile(url, 'utf8')
    const parsed: unknown = JSON.parse(bytes)
    if (!parsed || typeof parsed !== 'object' || !('schemaVersion' in parsed)) continue

    if (parsed.schemaVersion === 'mac-challenge-definition/v2') {
      const challenge = challengeDefinitionV2Schema.parse(parsed)
      challenges.push(challenge)
      challengeFiles.set(relative(fileURLToPath(repositoryRoot), fileURLToPath(url)), { challenge, bytes })
    }
    if (parsed.schemaVersion === 'mac-benchmark-definition/v2') {
      benchmarks.push(benchmarkDefinitionV2Schema.parse(parsed))
    }
  }

  return { challenges, benchmarks, challengeFiles }
}

function validateHistory(
  baseRef: string,
  challengeFiles: Map<string, { challenge: ChallengeDefinitionV2; bytes: string }>
): void {
  const priorPaths = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', baseRef, '--', 'benchmarks/challenges'],
    { encoding: 'utf8' }
  ).trim().split('\n').filter(path => path.endsWith('.json'))
  const priorPathSet = new Set(priorPaths)

  for (const [path, current] of challengeFiles) {
    if (!priorPathSet.has(path)) {
      assertInitialChallengeLifecycle(current.challenge)
      continue
    }
    const previousBytes = execFileSync('git', ['show', `${baseRef}:${path}`], { encoding: 'utf8' })
    const previous = challengeDefinitionV2Schema.parse(JSON.parse(previousBytes))
    assertChallengeLifecycleTransition(previous, current.challenge, previousBytes, current.bytes)
  }

  for (const path of priorPaths) {
    if (!challengeFiles.has(path)) {
      throw new Error(`Challenge version record ${path} cannot be removed; retire it through a versioned record`)
    }
  }
}

export async function validateBenchmarkRegistry(baseRef?: string): Promise<{
  challengeCount: number
  benchmarkCount: number
}> {
  const { challenges, benchmarks, challengeFiles } = await loadRegistry()
  const challengeKeys = challenges.map(challenge => `${challenge.id}@${challenge.version}`)
  if (new Set(challengeKeys).size !== challengeKeys.length) {
    throw new Error('Duplicate challenge ID/version records in benchmark registry')
  }

  assertReplacementLinks(challenges)
  if (baseRef) validateHistory(baseRef, challengeFiles)

  for (const benchmark of benchmarks) {
    await resolveBenchmark(
      { benchmarks, challenges },
      { id: benchmark.id, version: benchmark.version, integrityDigest: benchmark.integrityDigest }
    )
  }

  return { challengeCount: challenges.length, benchmarkCount: benchmarks.length }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) {
  const result = await validateBenchmarkRegistry(process.env.CHALLENGE_BASE_REF)
  console.log(`Validated ${result.challengeCount} challenge versions and ${result.benchmarkCount} v2 benchmark definitions.`)
}
