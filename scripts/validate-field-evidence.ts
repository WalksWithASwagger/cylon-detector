import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { stableStringify } from '../src/bench/artifact'
import { sha256Bytes, sha256Text } from '../src/bench/hash'
import { benchmarkDefinitionV2Schema, challengeDefinitionV2Schema } from '../src/bench/v2/contracts'
import { resolveBenchmark } from '../src/bench/v2/registry'

export interface NetworkEvidence {
  method: string
  url: string
  body?: string
}

export interface FieldEvidenceCheck {
  id: string
  status: 'pass' | 'fail'
  detail: string
}

interface FileBinding {
  path: string
  sha256: string
}

interface ScreenshotBinding extends FileBinding {
  width: number
  height: number
}

export interface FieldEvidenceManifest {
  schemaVersion: 'cylon-field-evidence/v1'
  generatedAt: string
  sourceCommit: string
  workingTreeDirty: boolean
  browser: string
  viewports: Array<{ label: string; width: number; height: number; zoomPercent: number }>
  analysis: { channel: 'local-rehearsal'; mode: 'mock'; provider: 'local'; model: string }
  source: { kind: 'synthetic-pdf' }
  benchmarkDigest: string
  artifactDigest: string
  privacy: { forbiddenPaperRequests: NetworkEvidence[]; externalRequestsBlocked: number; totalRequests: number }
  files: {
    sourcePdf: FileBinding
    receipt: FileBinding
    staticReport: FileBinding
    desktopScreenshot: ScreenshotBinding
    mobileScreenshot: ScreenshotBinding
  }
  checks: FieldEvidenceCheck[]
  packetDigest: string
}

export const FIELD_EVIDENCE_CHECK_IDS = [
  'malformed-pdf',
  'valid-pdf',
  'citation-verification',
  'human-rejection',
  'checkpoint-resume-match',
  'checkpoint-resume-mismatch',
  'receipt-import',
  'local-data-deletion',
  'static-report-no-js',
  'keyboard-critical-path',
  'accessibility-semantics-proxy',
  'focus-visible-proxy',
  'reduced-motion-proxy',
  'mobile-layout-proxy',
  'mobile-critical-containment',
  'css-zoom-layout-proxy',
  'privacy-network'
] as const

const digestPattern = /^[a-f0-9]{64}$/
const commitPattern = /^[a-f0-9]{40}$/

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  return value as Record<string, unknown>
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function digest(value: unknown, label: string): string {
  const candidate = string(value, label)
  if (!digestPattern.test(candidate)) throw new Error(`${label} must be a lowercase SHA-256 digest`)
  return candidate
}

function safeEvidencePath(value: unknown, label: string): string {
  const candidate = string(value, label)
  if (isAbsolute(candidate) || candidate.split(/[\\/]/).includes('..')) throw new Error(`${label} must stay inside the evidence directory`)
  return candidate
}

function endpointCategory(url: string): 'analytics' | 'feedback' | 'storage' | null {
  const normalized = url.toLowerCase()
  if (normalized.includes('mixpanel') || normalized.includes('/analytics') || normalized.includes('/collect')) return 'analytics'
  if (normalized.includes('/api/submit') || normalized.includes('/feedback')) return 'feedback'
  if (normalized.includes('upstash') || normalized.includes('/redis') || normalized.includes('/storage') || normalized.includes('/kv')) return 'storage'
  return null
}

export function assertNoForbiddenPaperTraffic(requests: NetworkEvidence[]): void {
  const forbidden = requests.find(request => endpointCategory(request.url))
  if (!forbidden) return
  throw new Error(`Mock bench attempted ${endpointCategory(forbidden.url)} endpoint: ${forbidden.method} ${forbidden.url}`)
}

export function assertResumeDigestMatch(expected: string, actual: string): void {
  digest(expected, 'Expected source digest')
  digest(actual, 'Reselected source digest')
  if (expected !== actual) throw new Error('Resume source digest mismatch')
}

export async function sha256File(path: string): Promise<string> {
  return sha256Bytes(await readFile(path))
}

export async function verifyBoundFile(root: string, binding: FileBinding, label: string): Promise<Uint8Array> {
  const path = join(root, safeEvidencePath(binding.path, `${label}.path`))
  const bytes = await readFile(path)
  const expected = digest(binding.sha256, `${label}.sha256`)
  const actual = await sha256Bytes(bytes)
  if (actual !== expected) throw new Error(`${label} digest mismatch`)
  return bytes
}

function unsignedPacket(input: Omit<FieldEvidenceManifest, 'packetDigest'> | FieldEvidenceManifest): Omit<FieldEvidenceManifest, 'packetDigest'> {
  const { packetDigest: _packetDigest, ...unsigned } = input as FieldEvidenceManifest
  return unsigned
}

export async function computePacketDigest(input: Omit<FieldEvidenceManifest, 'packetDigest'> | FieldEvidenceManifest): Promise<string> {
  return sha256Text(stableStringify(unsignedPacket(input)))
}

export async function assertPacketDigest(manifest: FieldEvidenceManifest): Promise<void> {
  if (await computePacketDigest(manifest) !== manifest.packetDigest) throw new Error('Field evidence packet digest mismatch')
}

function fileBinding(value: unknown, label: string): FileBinding {
  const binding = record(value, label)
  return { path: safeEvidencePath(binding.path, `${label}.path`), sha256: digest(binding.sha256, `${label}.sha256`) }
}

function screenshotBinding(value: unknown, label: string): ScreenshotBinding {
  const raw = record(value, label)
  const binding = fileBinding(value, label)
  const width = Number(raw.width)
  const height = Number(raw.height)
  if (![width, height].every(Number.isInteger) || width <= 0 || height <= 0) throw new Error(`${label} dimensions must be positive integers`)
  return { path: String(binding.path), sha256: String(binding.sha256), width, height }
}

export function validateFieldEvidence(
  input: unknown,
  expectations: { expectedCommit?: string; expectedWorkingTreeDirty?: boolean } = {}
): FieldEvidenceManifest {
  const manifest = record(input, 'Field evidence manifest')
  if (manifest.schemaVersion !== 'cylon-field-evidence/v1') throw new Error('Unsupported field evidence schema')
  const generatedAt = string(manifest.generatedAt, 'generatedAt')
  if (Number.isNaN(Date.parse(generatedAt))) throw new Error('generatedAt must be an ISO date-time')
  const sourceCommit = string(manifest.sourceCommit, 'sourceCommit')
  if (!commitPattern.test(sourceCommit)) throw new Error('sourceCommit must be an exact 40-character git commit')
  if (expectations.expectedCommit && sourceCommit !== expectations.expectedCommit) {
    throw new Error(`Evidence commit ${sourceCommit} does not match HEAD ${expectations.expectedCommit}`)
  }
  if (typeof manifest.workingTreeDirty !== 'boolean') throw new Error('workingTreeDirty must be a boolean')
  if (expectations.expectedWorkingTreeDirty !== undefined && manifest.workingTreeDirty !== expectations.expectedWorkingTreeDirty) {
    throw new Error('Evidence working tree state does not match git status')
  }
  string(manifest.browser, 'browser')

  if (!Array.isArray(manifest.viewports)) throw new Error('viewports must be an array')
  const viewports = manifest.viewports.map((value, index) => {
    const viewport = record(value, `viewports[${index}]`)
    const label = string(viewport.label, `viewports[${index}].label`)
    const width = Number(viewport.width)
    const height = Number(viewport.height)
    const zoomPercent = Number(viewport.zoomPercent)
    if (![width, height, zoomPercent].every(Number.isFinite) || width <= 0 || height <= 0 || zoomPercent <= 0) {
      throw new Error(`viewports[${index}] dimensions and zoom must be positive numbers`)
    }
    return { label, width, height, zoomPercent }
  })
  if (!viewports.some(viewport => viewport.label === 'mobile' && viewport.width === 375 && viewport.height === 812)) {
    throw new Error('Evidence must include the 375 by 812 mobile viewport')
  }
  if (!viewports.some(viewport => viewport.zoomPercent === 200)) throw new Error('Evidence must include the CSS zoom layout proxy')

  const analysis = record(manifest.analysis, 'analysis')
  if (analysis.channel !== 'local-rehearsal' || analysis.mode !== 'mock' || analysis.provider !== 'local') {
    throw new Error('Field evidence must use the local mock rehearsal channel')
  }
  string(analysis.model, 'analysis.model')
  if (record(manifest.source, 'source').kind !== 'synthetic-pdf') throw new Error('Field evidence must use a synthetic PDF')
  digest(manifest.benchmarkDigest, 'benchmarkDigest')
  digest(manifest.artifactDigest, 'artifactDigest')
  digest(manifest.packetDigest, 'packetDigest')

  const privacy = record(manifest.privacy, 'privacy')
  if (!Array.isArray(privacy.forbiddenPaperRequests) || privacy.forbiddenPaperRequests.length !== 0) {
    throw new Error('Field evidence contains forbidden telemetry or storage traffic')
  }
  const externalRequestsBlocked = Number(privacy.externalRequestsBlocked)
  const totalRequests = Number(privacy.totalRequests)
  if (![externalRequestsBlocked, totalRequests].every(Number.isInteger) || externalRequestsBlocked < 0 || totalRequests < externalRequestsBlocked) {
    throw new Error('privacy request counts are invalid')
  }

  const files = record(manifest.files, 'files')
  const bindings = {
    sourcePdf: fileBinding(files.sourcePdf, 'files.sourcePdf'),
    receipt: fileBinding(files.receipt, 'files.receipt'),
    staticReport: fileBinding(files.staticReport, 'files.staticReport'),
    desktopScreenshot: screenshotBinding(files.desktopScreenshot, 'files.desktopScreenshot'),
    mobileScreenshot: screenshotBinding(files.mobileScreenshot, 'files.mobileScreenshot')
  }
  const paths = Object.values(bindings).map(binding => binding.path)
  if (bindings.desktopScreenshot.path === bindings.mobileScreenshot.path) throw new Error('Desktop and mobile screenshot paths must be distinct')
  if (new Set(paths).size !== paths.length) throw new Error('Evidence file paths must be distinct')

  if (!Array.isArray(manifest.checks)) throw new Error('checks must be an array')
  const checks = manifest.checks.map((value, index) => {
    const check = record(value, `checks[${index}]`)
    const id = string(check.id, `checks[${index}].id`)
    if (check.status !== 'pass' && check.status !== 'fail') throw new Error(`checks[${index}].status is invalid`)
    return { id, status: check.status, detail: string(check.detail, `checks[${index}].detail`) }
  })
  if (new Set(checks.map(check => check.id)).size !== checks.length) throw new Error('Evidence check IDs must be unique')
  for (const id of FIELD_EVIDENCE_CHECK_IDS) {
    const check = checks.find(candidate => candidate.id === id)
    if (!check) throw new Error(`Missing required evidence check: ${id}`)
    if (check.status !== 'pass') throw new Error(`Evidence check did not pass: ${id}`)
  }
  return manifest as unknown as FieldEvidenceManifest
}

function pngDimensions(bytes: Uint8Array, label: string): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10]
  if (bytes.length < 24 || signature.some((value, index) => bytes[index] !== value)) throw new Error(`${label} is not a PNG`)
  if (new TextDecoder().decode(bytes.slice(12, 16)) !== 'IHDR') throw new Error(`${label} has no PNG IHDR header`)
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

export async function validateFieldEvidencePacket(
  manifestPath: string,
  expectations: { expectedCommit?: string; expectedWorkingTreeDirty?: boolean } = {}
): Promise<FieldEvidenceManifest> {
  const manifest = validateFieldEvidence(JSON.parse(await readFile(manifestPath, 'utf8')), expectations)
  await assertPacketDigest(manifest)
  const root = dirname(manifestPath)
  const sourceBytes = await verifyBoundFile(root, manifest.files.sourcePdf, 'Synthetic source PDF')
  const receiptBytes = await verifyBoundFile(root, manifest.files.receipt, 'Canonical receipt')
  const reportBytes = await verifyBoundFile(root, manifest.files.staticReport, 'Static report')
  const desktopBytes = await verifyBoundFile(root, manifest.files.desktopScreenshot, 'Desktop screenshot')
  const mobileBytes = await verifyBoundFile(root, manifest.files.mobileScreenshot, 'Mobile screenshot')

  const receipt = record(JSON.parse(new TextDecoder().decode(receiptBytes)), 'Canonical receipt')
  if (receipt.schemaVersion !== 'mac-evaluation-run/v2') throw new Error('Canonical receipt must use mac-evaluation-run/v2')
  const receiptDigest = digest(receipt.integrityDigest, 'Canonical receipt integrityDigest')
  const { integrityDigest: _receiptDigest, ...unsignedReceipt } = receipt
  if (await sha256Text(stableStringify(unsignedReceipt)) !== receiptDigest) throw new Error('Canonical receipt integrity digest mismatch')
  const benchmarkSnapshot = record(receipt.benchmark, 'Canonical receipt benchmark')
  const benchmark = benchmarkDefinitionV2Schema.parse(benchmarkSnapshot.definition)
  if (!Array.isArray(benchmarkSnapshot.challenges)) throw new Error('Canonical receipt benchmark challenges must be an array')
  const challenges = benchmarkSnapshot.challenges.map(challenge => challengeDefinitionV2Schema.parse(challenge))
  await resolveBenchmark(
    { benchmarks: [benchmark], challenges },
    { id: benchmark.id, version: benchmark.version, integrityDigest: benchmark.integrityDigest }
  )
  if (receipt.sourceCommit !== manifest.sourceCommit) throw new Error('Receipt source commit does not match packet')
  const analysis = record(receipt.analysis, 'Canonical receipt analysis')
  if (analysis.mode !== 'mock' || analysis.provider !== 'local' || analysis.model !== manifest.analysis.model || analysis.store !== false) {
    throw new Error('Receipt analysis provenance does not match packet')
  }
  if (receiptDigest !== manifest.artifactDigest) throw new Error('Canonical run digest does not match packet')
  if (benchmark.integrityDigest !== manifest.benchmarkDigest) throw new Error('Benchmark digest does not match packet')
  const paper = record(receipt.paper, 'Canonical receipt paper')
  if (await sha256Bytes(sourceBytes) !== digest(paper.sha256, 'Canonical receipt paper.sha256')) throw new Error('Synthetic source PDF does not match receipt')

  const report = new TextDecoder().decode(reportBytes)
  if (/<script/i.test(report) || !report.includes('Machine said') || !report.includes('Human called') || !report.includes(receiptDigest)) {
    throw new Error('Static report does not reproduce the canonical run')
  }
  const desktopDimensions = pngDimensions(desktopBytes, 'Desktop screenshot')
  const mobileDimensions = pngDimensions(mobileBytes, 'Mobile screenshot')
  if (desktopDimensions.width !== manifest.files.desktopScreenshot.width || desktopDimensions.height !== manifest.files.desktopScreenshot.height) {
    throw new Error('Desktop screenshot dimensions do not match packet')
  }
  if (mobileDimensions.width !== manifest.files.mobileScreenshot.width || mobileDimensions.height !== manifest.files.mobileScreenshot.height) {
    throw new Error('Mobile screenshot dimensions do not match packet')
  }
  if (desktopDimensions.width !== 1280 || mobileDimensions.width !== 375) throw new Error('Screenshot widths do not match tested viewports')
  return manifest
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback
}

async function main(): Promise<void> {
  const manifestPath = option('--manifest', 'test-results/field-evidence/manifest.json')
  const expectedCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const expectedWorkingTreeDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0
  const manifest = await validateFieldEvidencePacket(manifestPath, { expectedCommit, expectedWorkingTreeDirty })
  console.log(`Field evidence byte integrity verified for ${manifest.sourceCommit}: packet ${manifest.packetDigest}, run ${manifest.artifactDigest}.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
