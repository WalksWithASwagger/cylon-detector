import {
  assertLocalProxyConfiguration,
  buildOsfReadyPackage,
  buildRoCrate,
  compareRunVersions,
  createPreregistration,
  createTheoryBundle,
  describeReplayDrift,
  localModelAdapterSchema,
  normalizeMetadataIntake,
  researchRunContextSchema,
  type Preregistration
} from './research'
import { normalizeEvaluationRun, type EvaluationRunV2 } from './v2/artifact'

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing #${id}`)
  return value as T
}

function lines(id: string): string[] {
  return element<HTMLTextAreaElement>(id).value.split('\n').map(value => value.trim()).filter(Boolean)
}

function download(fileName: string, value: unknown) {
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(value, null, 2)}\n`], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function receiptFiles(id: string): Promise<EvaluationRunV2[]> {
  const files = [...(element<HTMLInputElement>(id).files ?? [])]
  return Promise.all(files.map(async file => {
    if (file.size > 5 * 1024 * 1024) throw new Error('Receipts must be 5 MB or smaller')
    return normalizeEvaluationRun(JSON.parse(await file.text()) as unknown)
  }))
}

export function mountResearchWorkspace(showToast: (message: string, tone?: 'normal' | 'error') => void) {
  let canonicalRun: EvaluationRunV2 | null = null
  let preregistration: Preregistration | null = null
  const status = element<HTMLElement>('research-status')
  const preregButton = element<HTMLButtonElement>('export-preregistration')
  const osfButton = element<HTMLButtonElement>('export-osf-package')

  preregButton.addEventListener('click', () => void (async () => {
    try {
      if (!canonicalRun) throw new Error('Seal or import a canonical receipt first')
      preregistration = await createPreregistration({
        registrationId: crypto.randomUUID(),
        benchmark: canonicalRun.benchmark.definition,
        predictions: lines('prereg-predictions'),
        exclusions: lines('prereg-exclusions'),
        interpretationRules: lines('prereg-rules'),
        plannedAnalyses: lines('prereg-analyses')
      })
      download(`cylon-detector_${preregistration.registrationId}_preregistration.json`, preregistration)
      osfButton.disabled = false
      status.textContent = 'PREREGISTRATION FROZEN LOCALLY / SEALED REPLICATION MAY BIND THIS DIGEST'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Preregistration failed', 'error') }
  })())

  element<HTMLButtonElement>('export-research-context').addEventListener('click', () => {
    try {
      const runClass = element<HTMLSelectElement>('research-run-class').value as 'optimization' | 'sealed_replication'
      const deviations = lines('research-deviations').map(description => ({
        recordedAt: new Date().toISOString(),
        description,
        impact: 'Human interpretation required; deviation retained in the run context.'
      }))
      const context = researchRunContextSchema.parse({
        runClass,
        ...(preregistration ? { preregistrationDigest: preregistration.integrityDigest } : {}),
        deviations
      })
      download(`cylon-detector_${runClass}_context.json`, context)
      status.textContent = `${runClass.toUpperCase()} CONTEXT EXPORTED / DEVIATIONS RETAINED`
    } catch (error) { showToast(error instanceof Error ? error.message : 'Research context failed', 'error') }
  })

  osfButton.addEventListener('click', () => void (async () => {
    try {
      if (!canonicalRun || !preregistration) throw new Error('A canonical receipt and frozen preregistration are required')
      const name = element<HTMLInputElement>('crate-contributor').value.trim() || 'Unnamed contributor'
      const role = element<HTMLInputElement>('crate-role').value.trim() || 'Other'
      const crate = await buildRoCrate(canonicalRun, [{ name, creditRole: role }])
      const packageArtifact = await buildOsfReadyPackage(canonicalRun, preregistration, crate)
      download(`cylon-detector_${packageArtifact.packageId}_osf-ready.json`, packageArtifact)
      status.textContent = 'OSF-READY PACKAGE EXPORTED LOCALLY / NO ARCHIVE WRITE OCCURRED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'OSF package failed', 'error') }
  })())

  element<HTMLButtonElement>('export-theory-bundle').addEventListener('click', () => void (async () => {
    try {
      const runs = await receiptFiles('theory-bundle-input')
      if (!runs.length) throw new Error('Import at least one canonical receipt')
      const label = element<HTMLInputElement>('theory-bundle-label').value.trim() || 'Theory bundle'
      const bundle = await createTheoryBundle(label, runs)
      download(`cylon-detector_${bundle.bundleId}_theory-bundle.json`, bundle)
      status.textContent = 'THEORY BUNDLE EXPORTED / SOURCE IDENTITY RETAINED PER CLAIM'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Theory bundle failed', 'error') }
  })())

  element<HTMLButtonElement>('export-run-comparison').addEventListener('click', () => void (async () => {
    try {
      const runs = await receiptFiles('compare-runs-input')
      if (runs.length !== 2) throw new Error('Import exactly two canonical receipts')
      const comparison = compareRunVersions(runs[0], runs[1])
      const drift = describeReplayDrift(runs[0], runs[1])
      download(`cylon-detector_${runs[0].runId}_${runs[1].runId}_comparison-drift.json`, { comparison, drift })
      status.textContent = 'CATEGORICAL COMPARISON + DRIFT EXPORTED / NO WINNER SCORE'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Run comparison failed', 'error') }
  })())

  element<HTMLButtonElement>('export-metadata').addEventListener('click', () => {
    try {
      const metadata = normalizeMetadataIntake(JSON.parse(element<HTMLTextAreaElement>('metadata-intake').value) as unknown)
      download('cylon-detector_metadata-intake.json', metadata)
      status.textContent = 'METADATA EXPORTED / FULL TEXT DISCARDED / NO PAPER DOWNLOADED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Metadata intake failed', 'error') }
  })

  element<HTMLButtonElement>('export-local-adapter').addEventListener('click', () => {
    try {
      const candidate = localModelAdapterSchema.parse({
        schemaVersion: 'openai-compatible-local-adapter/v1',
        enabled: element<HTMLInputElement>('local-proxy-enabled').checked,
        baseUrl: element<HTMLInputElement>('local-proxy-url').value.trim(),
        model: element<HTMLInputElement>('local-proxy-model').value.trim(),
        launchedByHuman: element<HTMLInputElement>('local-proxy-launched').checked
      })
      const configuration = candidate.enabled ? assertLocalProxyConfiguration(candidate) : candidate
      download('cylon-detector_local-model-adapter.json', configuration)
      status.textContent = configuration.enabled
        ? 'LOCAL PROXY CONFIG EXPORTED / LOOPBACK + HUMAN-LAUNCHED BOUNDARY VERIFIED'
        : 'DISABLED LOCAL PROXY CONFIG EXPORTED / NO MODEL CONTACTED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Local adapter validation failed', 'error') }
  })

  return {
    setCanonicalRun(run: EvaluationRunV2) {
      canonicalRun = run
      preregistration = null
      preregButton.disabled = false
      osfButton.disabled = true
      status.textContent = 'CANONICAL RECEIPT READY / RESEARCH EXPORTS REMAIN LOCAL'
    }
  }
}
