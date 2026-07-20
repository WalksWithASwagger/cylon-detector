import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import { relative } from 'node:path'
import {
  benchmarkDefinitionV2Schema,
  challengeDefinitionV2Schema,
  type ChallengeDefinitionV2
} from '../src/bench/v2/contracts'
import {
  assertPublishedChallengeImmutable,
  resolveBenchmark
} from '../src/bench/v2/registry'

const repositoryRoot = new URL('../', import.meta.url)
const benchmarkRoot = new URL('../benchmarks/', import.meta.url)
const entries = await readdir(benchmarkRoot, { recursive: true, withFileTypes: true })
const jsonFiles = entries.filter(entry => entry.isFile() && entry.name.endsWith('.json'))
const challenges: ChallengeDefinitionV2[] = []
const benchmarks = []

for (const entry of jsonFiles) {
  const url = new URL(entry.parentPath.replace(`${benchmarkRoot.pathname}/`, '') + `/${entry.name}`, benchmarkRoot)
  const parsed: unknown = JSON.parse(await readFile(url, 'utf8'))
  if (parsed && typeof parsed === 'object' && 'schemaVersion' in parsed) {
    if (parsed.schemaVersion === 'mac-challenge-definition/v2') {
      const challenge = challengeDefinitionV2Schema.parse(parsed)
      challenges.push(challenge)

      const baseRef = process.env.CHALLENGE_BASE_REF
      if (baseRef) {
        const path = relative(repositoryRoot.pathname, url.pathname)
        try {
          const priorText = execFileSync('git', ['show', `${baseRef}:${path}`], { encoding: 'utf8' })
          const prior = challengeDefinitionV2Schema.parse(JSON.parse(priorText))
          assertPublishedChallengeImmutable(prior, challenge)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (!/exists on disk, but not in|does not exist in|path .* exists on disk/i.test(message)) throw error
        }
      }
    }
    if (parsed.schemaVersion === 'mac-benchmark-definition/v2') {
      benchmarks.push(benchmarkDefinitionV2Schema.parse(parsed))
    }
  }
}

const challengeKeys = challenges.map(challenge => `${challenge.id}@${challenge.version}`)
if (new Set(challengeKeys).size !== challengeKeys.length) {
  throw new Error('Duplicate challenge ID/version records in benchmark registry')
}

for (const benchmark of benchmarks) {
  await resolveBenchmark(
    { benchmarks, challenges },
    { id: benchmark.id, version: benchmark.version, integrityDigest: benchmark.integrityDigest }
  )
}

console.log(`Validated ${challenges.length} challenge versions and ${benchmarks.length} v2 benchmark definitions.`)
