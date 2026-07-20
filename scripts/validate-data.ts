import { execFileSync } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'

const EXPECTED_THEORY_PROFILES = 211
const dataDirectory = new URL('../public/data/', import.meta.url)
const entries = await readdir(dataDirectory, { withFileTypes: true })
const files = entries
  .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
  .map(entry => entry.name)
  .sort()

if (files.length !== EXPECTED_THEORY_PROFILES) {
  throw new Error(`Expected ${EXPECTED_THEORY_PROFILES} root theory profiles; found ${files.length}.`)
}

const tracked = execFileSync('git', ['ls-files', 'public/data'], { encoding: 'utf8' })
  .trim()
  .split('\n')
  .filter(file => /^public\/data\/[^/]+\.json$/.test(file))
const caseFolded = new Map<string, string>()
for (const file of tracked) {
  const key = file.toLocaleLowerCase('en-US')
  const prior = caseFolded.get(key)
  if (prior && prior !== file) throw new Error(`Case-colliding theory files: ${prior} and ${file}`)
  caseFolded.set(key, file)
}

for (const file of files) {
  const parsed = JSON.parse(await readFile(new URL(file, dataDirectory), 'utf8')) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${file} is not a JSON object.`)
  }
}

console.log(`Validated ${files.length} unique root theory profiles; no case collisions or malformed JSON.`)
