import { readdir, readFile, stat } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const required = [
  'dist/index.html',
  'dist/paper.html',
  'dist/bench.html',
  'dist/benchmarks/mac-lab-001/0.1.0-alpha.1.json',
  'dist/benchmarks/mac-lab-001/1.0.0.json',
  'dist/schemas/benchmark-definition.v1.schema.json',
  'dist/schemas/evaluation-run.v1.schema.json',
  'dist/schemas/benchmark-definition.v2.schema.json',
  'dist/schemas/evaluation-run.v2.schema.json',
  'dist/schemas/blind-review-packet.v1.schema.json',
  'dist/schemas/review-contribution.v1.schema.json',
  'dist/schemas/review-bundle.v1.schema.json',
  'dist/schemas/preregistration.v1.schema.json',
  'dist/fixtures/demo/witness-theory-adjudicated.v2.json'
]

for (const file of required) {
  if (!(await stat(new URL(file, root)).catch(() => null))?.isFile()) {
    throw new Error(`Required build artifact is missing: ${file}`)
  }
}

async function filesUnder(directory: URL): Promise<URL[]> {
  const children = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(children.map(async child => {
    const url = new URL(child.name + (child.isDirectory() ? '/' : ''), directory)
    return child.isDirectory() ? filesUnder(url) : [url]
  }))).flat()
}

const clientFiles = (await filesUnder(new URL('dist/', root))).filter(file =>
  /\.(?:html|js|mjs|css|json)$/.test(file.pathname)
)
for (const file of clientFiles) {
  const source = await readFile(file, 'utf8')
  if (source.includes('OPENAI_API_KEY') || source.includes('MAC_BENCH_ACCESS_TOKEN')) {
    throw new Error(`Server-only secret name leaked into client build: ${file.pathname}`)
  }
}

const scoreSurfaces = [
  new URL('bench.html', root),
  new URL('src/bench/', root),
  new URL('benchmarks/', root),
  new URL('schemas/', root)
]
const scoreFiles = (await Promise.all(scoreSurfaces.map(async surface =>
  (await stat(surface)).isDirectory() ? filesUnder(surface) : [surface]
))).flat()
const bannedScore = /(?:\b\d+(?:\.\d+)?\s*%\s*(?:conscious|consciousness)|(?:conscious|consciousness)[^\n.]{0,40}\b\d+(?:\.\d+)?\s*%)/i
for (const file of scoreFiles) {
  const source = await readFile(file, 'utf8')
  if (bannedScore.test(source)) throw new Error(`Banned percentage-consciousness claim: ${file.pathname}`)
}

const atlas = await readFile(new URL('dist/index.html', root), 'utf8')
const paper = await readFile(new URL('dist/paper.html', root), 'utf8')
if (!atlas.includes('Consciousness Atlas')) throw new Error('Atlas root regression: expected title is missing.')
if (!paper.includes('A Landscape of Consciousness')) throw new Error('Paper regression: expected source title is missing.')

const benchHtml = await readFile(new URL('dist/bench.html', root), 'utf8')
const benchEntry = benchHtml.match(/src="([^"]*\/bench-[^"]+\.js)"/)?.[1]
if (!benchEntry) throw new Error('Could not locate the built Bench client entry.')
const benchBundle = await readFile(new URL(`dist${benchEntry}`, root), 'utf8')
if (/mixpanel|analytics\.track/i.test(benchBundle)) throw new Error('Bench telemetry is present in the client entry.')

console.log('Validated release contracts, server-only secrets, no-score surfaces, telemetry isolation, and inherited pages.')
