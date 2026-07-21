import './styles.scss'
import { applyReviewDecision, canExportAdjudicated, createReviewState, type ReviewState } from './adjudication'
import { requestAnalysis, type AnalysisTransport } from './apiClient'
import { createEvaluationRun, reviewFieldKeys } from './artifact'
import { benchmarkDefinition } from './benchmark'
import { verifyCitations } from './citationVerifier'
import {
  browserCheckpointDatabase,
  checkpointPaperMatches,
  createCheckpoint,
  type BenchCheckpoint
} from './checkpoint'
import { extractPaper, renderPdfPage, type PaperSession } from './pdf'
import { type AiDraft, type ChallengeId, type CitationDraft, type DemandKey, type VerifiedCitation, type Verdict } from './schema'
import type { AnalysisResponse } from './analysis'
import {
  appendReviewEvent,
  evaluationFileNameV2,
  normalizeEvaluationRun,
  type ReviewEventV2
} from './v2/artifact'
import { analysisRequestV2Schema } from './v2/contracts'
import { defaultBenchmarkV2, defaultChallengeDefinitions } from './v2/defaultRegistry'
import { generateReportBundle, type ReportBundle } from './v2/reports'
import type { EvaluationRunV2 } from './v2/artifact'
import { mountCollaborationWorkspace } from './collaborationUi'
import { mountResearchWorkspace } from './researchUi'
import { mountExperimentsWorkspace } from './experimentsUi'

declare const __SOURCE_COMMIT__: string

async function markDisplayFontReady() {
  const fontSet = document.fonts
  if (!fontSet || typeof fontSet.load !== 'function') return
  try {
    const faces = await fontSet.load('16px "Bebas Neue"', 'INTERROGATE THE THEORY')
    if (faces.length > 0 && faces.every(face => face.status === 'loaded')) {
      document.documentElement.classList.add('display-font-ready')
    }
  } catch {
    return
  }
}

void markDisplayFontReady()

const demandLabels: Record<DemandKey, string> = {
  explanation: 'Explanation',
  mechanism: 'Mechanism',
  novelPrediction: 'Novel prediction',
  falsifier: 'Falsifier',
  measurableWitness: 'Measurable witness'
}

const verdictLabels: Record<Verdict, string> = {
  survives: 'Survives',
  strained: 'Strained',
  evades: 'Evades',
  breaks: 'Breaks',
  insufficient_evidence: 'Insufficient evidence'
}

let paperSession: PaperSession | null = null
let analysisResponse: AnalysisResponse | null = null
let review: ReviewState | null = null
let verifiedCitations: VerifiedCitation[] = []
let pendingCheckpoint: BenchCheckpoint | null = null
let activeCheckpointId: string | null = null
let lastIntegrityDigest: string | null = null
let evidenceReturnTarget: HTMLElement | null = null
let currentRunId: string | null = null
let lastCanonicalRun: EvaluationRunV2 | null = null
let reviewEvents: ReviewEventV2[] = []
const checkpointDatabase = browserCheckpointDatabase()

function element<T extends HTMLElement>(id: string): T {
  const target = document.getElementById(id)
  if (!target) throw new Error(`Missing #${id}`)
  return target as T
}

const dropZone = element<HTMLDivElement>('drop-zone')
const paperInput = element<HTMLInputElement>('paper-input')
const dropStatus = element<HTMLElement>('drop-status')
const paperReadout = element<HTMLDivElement>('paper-readout')
const analysisControls = element<HTMLDivElement>('analysis-controls')
const analysisConsent = element<HTMLInputElement>('analysis-consent')
const analysisAccessToken = element<HTMLInputElement>('analysis-access-token')
const reviewerName = element<HTMLInputElement>('reviewer-name')
const analyzeButton = element<HTMLButtonElement>('analyze-button')
const resultsStage = element<HTMLElement>('results-stage')
const challengeGrid = element<HTMLDivElement>('challenge-grid')
const theoryClaims = element<HTMLDivElement>('theory-claims')
const reviewResolved = element<HTMLElement>('review-resolved')
const reviewProgress = element<HTMLElement>('review-progress')
const exportFinal = element<HTMLButtonElement>('export-final')
const exportDraft = element<HTMLButtonElement>('export-draft')
const artifactInput = element<HTMLInputElement>('artifact-input')
const importedArtifact = element<HTMLDivElement>('imported-artifact')
const artifactSummary = element<HTMLElement>('artifact-summary')
const checkpointList = element<HTMLSelectElement>('checkpoint-list')
const loadCheckpoint = element<HTMLButtonElement>('load-checkpoint')
const deleteCheckpoint = element<HTMLButtonElement>('delete-checkpoint')
const deleteAllCheckpoints = element<HTMLButtonElement>('delete-all-checkpoints')
const checkpointResumeStatus = element<HTMLElement>('checkpoint-resume-status')
const manifestSource = element<HTMLElement>('manifest-source')
const manifestChannel = element<HTMLElement>('manifest-channel')
const manifestAnalysis = element<HTMLElement>('manifest-analysis')
const manifestHuman = element<HTMLElement>('manifest-human')
const manifestIntegrity = element<HTMLElement>('manifest-integrity')
const claimLedgerPreview = element<HTMLElement>('claim-ledger-preview')
const reportActions = element<HTMLElement>('report-actions')
const evidenceViewer = element<HTMLElement>('evidence-viewer')
const viewerStatus = element<HTMLElement>('viewer-status')
const viewerQuote = element<HTMLElement>('viewer-quote')
const pdfCanvas = element<HTMLCanvasElement>('pdf-canvas')
const toast = element<HTMLElement>('toast')

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character)
}

function showToast(message: string, tone: 'normal' | 'error' = 'normal') {
  toast.textContent = message
  toast.dataset.tone = tone
  toast.hidden = false
  window.setTimeout(() => { toast.hidden = true }, 4200)
}

const collaborationWorkspace = mountCollaborationWorkspace(showToast)
const researchWorkspace = mountResearchWorkspace(showToast)
mountExperimentsWorkspace(showToast)

function setPhase(phase: string) {
  const phases = ['paper', 'analysis', 'verify', 'review', 'export']
  const current = phases.indexOf(phase)
  document.querySelectorAll<HTMLElement>('.phase-rail li').forEach(item => {
    const index = phases.indexOf(item.dataset.phase ?? '')
    item.classList.toggle('active', index === current)
    item.classList.toggle('complete', index < current)
  })
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function resolvedReviewCount(): number {
  if (!review) return 0
  return Object.values(review.challenges).reduce((total, challenge) =>
    total + Object.values(challenge.fields).filter(field => field.decision !== 'pending').length +
    (challenge.verdict.decision === 'pending' ? 0 : 1), 0)
}

function totalReviewCalls(): number {
  return (analysisResponse?.draft.challenges.length ?? defaultChallengeDefinitions.length) * (reviewFieldKeys().length + 1)
}

function updateManifest() {
  manifestSource.textContent = paperSession
    ? `${paperSession.paper.pageCount} ${paperSession.paper.pageCount === 1 ? 'page' : 'pages'} / ${paperSession.paper.sha256.slice(0, 12)}`
    : 'No paper'
  const transport = document.querySelector<HTMLInputElement>('input[name="transport"]:checked')?.value ?? 'local'
  manifestChannel.textContent = transport === 'server'
    ? 'OpenAI / consent required'
    : transport === 'local-proxy'
      ? 'Local loopback proxy / human launched'
      : 'Local rehearsal'
  manifestAnalysis.textContent = analysisResponse
    ? `${analysisResponse.analysis.mode} / ${analysisResponse.analysis.model} / ${analysisResponse.analysis.promptVersion}`
    : 'No draft'
  manifestHuman.textContent = `${resolvedReviewCount()} / ${totalReviewCalls()} calls`
  manifestIntegrity.textContent = lastIntegrityDigest ? `SHA-256 / ${lastIntegrityDigest.slice(0, 12)}` : 'No artifact'
}

async function renderCheckpointList(selectedId?: string) {
  try {
    const checkpoints = await checkpointDatabase.list()
    checkpointList.innerHTML = checkpoints.map(checkpoint => {
      const title = checkpoint.paper.title ?? checkpoint.paper.fileName
      return `<option value="${escapeHtml(checkpoint.checkpointId)}">${escapeHtml(title)} / ${new Date(checkpoint.savedAt).toLocaleString()}</option>`
    }).join('')
    if (selectedId && checkpoints.some(checkpoint => checkpoint.checkpointId === selectedId)) {
      checkpointList.value = selectedId
    }
    const available = checkpoints.length > 0
    loadCheckpoint.disabled = !available
    deleteCheckpoint.disabled = !available
    deleteAllCheckpoints.disabled = !available
    if (!available) checkpointResumeStatus.textContent = 'LOCAL CHECKPOINTS / NONE FOUND'
  } catch {
    checkpointResumeStatus.textContent = 'LOCAL CHECKPOINTS / STORAGE UNAVAILABLE'
  }
}

async function saveLocalCheckpoint() {
  if (!paperSession || !analysisResponse || !review) return
  try {
    const checkpoint = await createCheckpoint({
      checkpointId: activeCheckpointId ?? crypto.randomUUID(),
      ...(currentRunId ? { runId: currentRunId } : {}),
      paper: paperSession.paper,
      analysis: analysisResponse,
      verifiedCitations,
      review,
      reviewEvents
    })
    await checkpointDatabase.put(checkpoint)
    activeCheckpointId = checkpoint.checkpointId
    await renderCheckpointList(checkpoint.checkpointId)
    checkpointResumeStatus.textContent = 'CHECKPOINT SAVED / PAPER BYTES AND FULL TEXT EXCLUDED'
    showToast('CHECKPOINT SAVED LOCALLY / PAPER BYTES AND FULL TEXT NOT STORED')
  } catch {
    showToast('This checkpoint could not be saved in the browser.', 'error')
  }
}

async function prepareCheckpointResume() {
  if (!checkpointList.value) return
  try {
    pendingCheckpoint = await checkpointDatabase.get(checkpointList.value) ?? null
    if (!pendingCheckpoint) throw new Error('Checkpoint not found')
    checkpointResumeStatus.textContent = 'RESELECT THE ORIGINAL PDF / HASH MATCH REQUIRED'
    showToast('Checkpoint armed. Reselect the original PDF to prove the source match.')
  } catch {
    pendingCheckpoint = null
    showToast('That local checkpoint could not be opened.', 'error')
  }
}

async function deleteSelectedCheckpoint() {
  if (!checkpointList.value || !window.confirm('Delete this local checkpoint? This cannot be undone.')) return
  await checkpointDatabase.delete(checkpointList.value)
  if (activeCheckpointId === checkpointList.value) activeCheckpointId = null
  pendingCheckpoint = null
  await renderCheckpointList()
  showToast('Local checkpoint deleted.')
}

async function deleteEveryCheckpoint() {
  if (!window.confirm('Delete every Cylon Detector checkpoint stored in this browser? This cannot be undone.')) return
  await checkpointDatabase.clear()
  activeCheckpointId = null
  pendingCheckpoint = null
  await renderCheckpointList()
  showToast('All local checkpoints deleted.')
}

async function acquirePaper(file: File) {
  dropZone.classList.add('working')
  dropStatus.textContent = 'EXTRACTING PAGE SIGNALS…'
  analyzeButton.disabled = true
  resultsStage.hidden = true
  setPhase('paper')

  try {
    await paperSession?.document.cleanup()
    paperSession = await extractPaper(file)
    analysisResponse = null
    review = null
    verifiedCitations = []
    reviewEvents = []
    currentRunId = null
    lastCanonicalRun = null
    setReportAvailability(false)
    const paper = paperSession.paper
    const resumeCheckpoint = pendingCheckpoint && checkpointPaperMatches(paper, pendingCheckpoint)
      ? pendingCheckpoint
      : null
    if (pendingCheckpoint && !resumeCheckpoint) {
      checkpointResumeStatus.textContent = 'HASH MISMATCH / REVIEW NOT RESTORED'
      showToast('This PDF does not match the checkpoint. The saved review remains untouched.', 'error')
    }
    if (resumeCheckpoint) {
      paper.title = resumeCheckpoint.paper.title
      paper.authors = resumeCheckpoint.paper.authors
      paper.year = resumeCheckpoint.paper.year
      paper.doi = resumeCheckpoint.paper.doi
      paper.sourceUrl = resumeCheckpoint.paper.sourceUrl
    }
    paperReadout.innerHTML = `
      <div class="readout-title"><span>SOURCE LOCKED</span><label>Paper title<input id="paper-title" value="${escapeHtml(paper.title ?? paper.fileName)}" maxlength="500" /></label>
        <div class="metadata-edits">
          <label>Authors, separated by ;<input id="paper-authors" value="${escapeHtml(paper.authors?.join('; ') ?? '')}" maxlength="2000" /></label>
          <label>Year<input id="paper-year" value="${paper.year ?? ''}" inputmode="numeric" maxlength="4" /></label>
          <label>DOI<input id="paper-doi" value="${escapeHtml(paper.doi ?? '')}" maxlength="240" /></label>
        </div>
      </div>
      <dl>
        <div><dt>PDF pages</dt><dd>${paper.pageCount}</dd></div>
        <div><dt>Extracted text</dt><dd>${paper.characterCount.toLocaleString()} chars</dd></div>
        <div><dt>File mass</dt><dd>${formatBytes(paper.byteSize)}</dd></div>
        <div><dt>SHA-256</dt><dd title="${paper.sha256}">${paper.sha256.slice(0, 16)}…</dd></div>
      </dl>
      <p><i></i> Original PDF bytes remain in this browser.</p>`
    element<HTMLInputElement>('paper-title').addEventListener('input', event => {
      if (!paperSession) return
      const title = (event.target as HTMLInputElement).value.trim()
      paperSession.paper.title = title || undefined
    })
    element<HTMLInputElement>('paper-authors').addEventListener('input', event => {
      if (!paperSession) return
      const authors = (event.target as HTMLInputElement).value.split(';').map(author => author.trim()).filter(Boolean)
      paperSession.paper.authors = authors.length ? authors.slice(0, 50) : undefined
    })
    element<HTMLInputElement>('paper-year').addEventListener('input', event => {
      if (!paperSession) return
      const year = Number((event.target as HTMLInputElement).value)
      paperSession.paper.year = Number.isInteger(year) && year >= 1600 && year <= 2200 ? year : undefined
    })
    element<HTMLInputElement>('paper-doi').addEventListener('input', event => {
      if (!paperSession) return
      const doi = (event.target as HTMLInputElement).value.trim()
      paperSession.paper.doi = doi || undefined
    })
    paperReadout.hidden = false
    analysisControls.hidden = false
    analysisConsent.checked = false
    dropStatus.textContent = 'LOCAL PARSE / COMPLETE'
    dropZone.classList.add('loaded')
    if (resumeCheckpoint) {
      analysisResponse = resumeCheckpoint.analysis
      verifiedCitations = resumeCheckpoint.verifiedCitations
      review = resumeCheckpoint.humanReview
      reviewEvents = resumeCheckpoint.reviewEvents ?? []
      activeCheckpointId = resumeCheckpoint.checkpointId
      currentRunId = resumeCheckpoint.runId ?? crypto.randomUUID()
      pendingCheckpoint = null
      renderTheory(analysisResponse)
      renderChallenges()
      resultsStage.hidden = false
      checkpointResumeStatus.textContent = 'HASH MATCH / REVIEW RESTORED'
      showToast('Source hash matched. The human review is back on the console.')
    }
    updateManifest()
  } catch (error) {
    dropStatus.textContent = 'SOURCE REJECTED / SEE ERROR'
    showToast(error instanceof Error ? error.message : 'The PDF could not be read.', 'error')
  } finally {
    dropZone.classList.remove('working')
  }
}

function allDraftCitations(draft: AiDraft): CitationDraft[] {
  const citations = new Map<string, CitationDraft>()
  for (const claim of draft.theory.centralClaims) for (const citation of claim.citations) citations.set(citation.id, citation)
  for (const challenge of draft.challenges) {
    for (const field of reviewFieldKeys()) for (const citation of challenge[field].citations) citations.set(citation.id, citation)
  }
  return [...citations.values()]
}

function renderTheory(response: AnalysisResponse) {
  element<HTMLElement>('theory-name').textContent = response.draft.theory.name
  element<HTMLElement>('theory-summary').textContent = response.draft.theory.summary
  theoryClaims.innerHTML = response.draft.theory.centralClaims.map((claim, index) => `
    <article><b>CENTRAL CLAIM ${String(index + 1).padStart(2, '0')} / AI DRAFT</b><p>${escapeHtml(claim.text)}</p><div class="citation-row">${citationMarkup(claim.citations)}</div></article>`
  ).join('') || '<p class="citation-empty">NO CENTRAL CLAIMS EXTRACTED</p>'
  element<HTMLElement>('analysis-provenance').textContent = `${response.analysis.mode.toUpperCase()} DRAFT / ${response.analysis.model} / ${Math.round(response.analysis.latencyMs)} MS`
  element<HTMLElement>('theory-metrics').innerHTML = `
    <div><b>${response.draft.theory.centralClaims.length}</b><span>central claims</span></div>
    <div><b>${verifiedCitations.filter(citation => citation.verification !== 'not_found').length}</b><span>located quotes</span></div>
    <div><b>${response.analysis.inputTokens + response.analysis.outputTokens}</b><span>provider tokens</span></div>`
}

function fieldText(draft: AiDraft['challenges'][number], field: DemandKey): string {
  return draft[field].text
}

function citationMarkup(citations: CitationDraft[]): string {
  if (citations.length === 0) return '<span class="citation-empty">NO SOURCE CITATION</span>'
  return citations.map(citation => {
    const state = verifiedCitations.find(candidate => candidate.id === citation.id)?.verification ?? 'not_found'
    return `<button class="citation-chip ${state}" data-citation-id="${escapeHtml(citation.id)}"><b>p.${citation.pdfPage}</b><span>${state.replace('_', ' ')}</span></button>`
  }).join('')
}

function decisionMarkup(challengeId: ChallengeId, field: DemandKey | 'verdict', aiValue: string): string {
  const fieldReview = field === 'verdict' ? review?.challenges[challengeId].verdict : review?.challenges[challengeId].fields[field]
  const decision = fieldReview?.decision ?? 'pending'
  const finalValue = fieldReview?.adjudicatedValue
  const editor = field === 'verdict'
    ? `<select class="revision-value">${Object.entries(verdictLabels).map(([value, label]) => `<option value="${value}" ${value === aiValue ? 'selected' : ''}>${label}</option>`).join('')}</select>`
    : `<textarea class="revision-value" rows="5">${escapeHtml(aiValue)}</textarea>`

  return `
    ${finalValue ? `<div class="human-revision"><b>HUMAN REVISION</b><p>${escapeHtml(finalValue)}</p></div>` : ''}
    <div class="decision-state ${decision}"><i></i>${decision.replace('_', ' ')}</div>
    <div class="decision-actions">
      <button data-review-action="accept" data-challenge="${challengeId}" data-field="${field}">Accept</button>
      <button data-review-action="revise" data-challenge="${challengeId}" data-field="${field}">Revise</button>
      <button data-review-action="reject" data-challenge="${challengeId}" data-field="${field}">Reject</button>
    </div>
    <div class="review-editor" hidden data-editor-for="${challengeId}:${field}">
      <div class="revision-input">${editor}</div>
      <label>Human reason<input class="revision-reason" value="${escapeHtml(fieldReview?.reason ?? '')}" placeholder="What changed, and why?" /></label>
      <button class="save-review" data-challenge="${challengeId}" data-field="${field}">Commit human decision</button>
    </div>`
}

function renderChallenges() {
  if (!analysisResponse || !review) return
  challengeGrid.innerHTML = analysisResponse.draft.challenges.map((draft, index) => {
    const definition = benchmarkDefinition.challenges.find(challenge => challenge.id === draft.challengeId)!
    const demands = reviewFieldKeys().map((field, fieldIndex) => `
      <article class="demand-card" data-challenge-card="${draft.challengeId}" data-field-card="${field}">
        <header><span>${String(fieldIndex + 1).padStart(2, '0')}</span><h4>${demandLabels[field]}</h4></header>
        <div class="ai-draft-label">AI DRAFT / ${draft.extractionConfidence} extraction confidence</div>
        <p class="draft-copy">${escapeHtml(fieldText(draft, field))}</p>
        <div class="citation-row">${citationMarkup(draft[field].citations)}</div>
        ${decisionMarkup(draft.challengeId, field, fieldText(draft, field))}
      </article>`).join('')

    return `<section class="challenge-chamber challenge-${index + 1}">
      <header class="challenge-header">
        <div class="challenge-number">0${index + 1}</div>
        <div><p>ADVERSARIAL FILTER</p><h3>${escapeHtml(definition.shortName)}</h3></div>
        <span class="confidence-marker">${draft.extractionConfidence}</span>
      </header>
      <p class="phenomenon">${escapeHtml(definition.phenomenon)}</p>
      <blockquote>${escapeHtml(definition.adversarialPrompt)}</blockquote>
      <div class="demand-stack">${demands}</div>
      <article class="verdict-card" data-challenge-card="${draft.challengeId}" data-field-card="verdict">
        <div><span>PROPOSED VERDICT</span><strong>${escapeHtml(verdictLabels[draft.proposedVerdict])}</strong></div>
        <p>${escapeHtml(draft.verdictRationale)}</p>
        ${draft.evasionFlags.length ? `<ul>${draft.evasionFlags.map(flag => `<li>${escapeHtml(flag)}</li>`).join('')}</ul>` : ''}
        ${decisionMarkup(draft.challengeId, 'verdict', draft.proposedVerdict)}
      </article>
    </section>`
  }).join('')
  renderClaimLedgerPreview()
  updateReviewMeter()
}

function renderClaimLedgerPreview() {
  if (!analysisResponse || !review || !currentRunId) {
    claimLedgerPreview.innerHTML = ''
    return
  }
  const rows = analysisResponse.draft.challenges.flatMap(challenge =>
    reviewFieldKeys().map(demand => {
      const field = review!.challenges[challenge.challengeId].fields[demand]
      const citation = challenge[demand].citations[0]
      const source = citation
        ? `p.${citation.pdfPage} / ${verifiedCitations.find(candidate => candidate.id === citation.id)?.verification ?? 'not found'}`
        : 'No source quote'
      const call = field.decision === 'pending'
        ? 'Awaiting human call'
        : field.decision === 'revised'
          ? field.adjudicatedValue ?? 'Revised'
          : field.decision === 'rejected'
            ? field.reason ?? 'Rejected'
            : field.aiValue
      const id = `claim:${currentRunId}:${challenge.challengeId}:${demand}`
      return `<tr id="preview-${escapeHtml(id)}"><td>${escapeHtml(id)}</td><td>${escapeHtml(source)}</td><td>${escapeHtml(challenge.challengeId)}</td><td>${escapeHtml(demandLabels[demand])}</td><td>${escapeHtml(field.aiValue)}</td><td><span class="${field.decision}">${escapeHtml(field.decision)}</span><br>${escapeHtml(call)}</td></tr>`
    })
  ).join('')
  claimLedgerPreview.innerHTML = `<table><thead><tr><th>Stable ID</th><th>Source</th><th>Challenge</th><th>Demand</th><th>Machine said</th><th>Human called</th></tr></thead><tbody>${rows}</tbody></table>`
}

function hasBrokenAcceptedCitation(challengeId: ChallengeId, field: DemandKey): boolean {
  if (!analysisResponse || !review) return true
  if (review.challenges[challengeId].fields[field].decision !== 'accepted') return false
  const draft = analysisResponse.draft.challenges.find(challenge => challenge.challengeId === challengeId)!
  return draft[field].citations.some(citation => verifiedCitations.find(candidate => candidate.id === citation.id)?.verification === 'not_found')
}

function updateReviewMeter() {
  if (!review) return
  let resolved = 0
  let blocked = false
  for (const challengeId of ['provenance-flip', 'synesthesia', 'blindsight'] as ChallengeId[]) {
    const challenge = review.challenges[challengeId]
    resolved += Object.values(challenge.fields).filter(field => field.decision !== 'pending').length
    resolved += challenge.verdict.decision === 'pending' ? 0 : 1
    blocked ||= reviewFieldKeys().some(field => hasBrokenAcceptedCitation(challengeId, field))
  }
  reviewResolved.textContent = String(resolved)
  const total = totalReviewCalls()
  reviewProgress.style.width = `${(resolved / total) * 100}%`
  reviewProgress.setAttribute('aria-valuenow', String(resolved))
  reviewProgress.setAttribute('aria-valuemax', String(total))
  const ready = canExportAdjudicated(review) && !blocked
  exportFinal.disabled = !ready
  if (ready) {
    setPhase('export')
    artifactSummary.textContent = 'The human review is complete. This evidence trail is ready to seal.'
  } else {
    setPhase('review')
    const remaining = total - resolved
    artifactSummary.textContent = blocked ? 'An accepted field points to a broken citation. Revise or reject it before sealing.' : `${remaining} human ${remaining === 1 ? 'call' : 'calls'} left before this run can be sealed.`
  }
  updateManifest()
}

async function runAnalysis() {
  if (!paperSession || !analysisConsent.checked) return
  const transport = (document.querySelector<HTMLInputElement>('input[name="transport"]:checked')?.value ?? 'local') as AnalysisTransport
  const request = analysisRequestV2Schema.parse({
    schemaVersion: 'mac-analysis-request/v2',
    benchmark: {
      id: defaultBenchmarkV2.id,
      version: defaultBenchmarkV2.version,
      integrityDigest: defaultBenchmarkV2.integrityDigest
    },
    paper: paperSession.paper
  })
  analyzeButton.disabled = true
  analyzeButton.classList.add('working')
  analyzeButton.querySelector('span')!.textContent = 'Interrogating theory…'
  setPhase('analysis')

  try {
    const localConfiguration = {
      schemaVersion: 'openai-compatible-local-adapter/v1',
      enabled: element<HTMLInputElement>('local-proxy-enabled').checked,
      baseUrl: element<HTMLInputElement>('local-proxy-url').value.trim(),
      model: element<HTMLInputElement>('local-proxy-model').value.trim(),
      launchedByHuman: element<HTMLInputElement>('local-proxy-launched').checked
    }
    analysisResponse = await requestAnalysis(request, transport, analysisAccessToken.value, localConfiguration)
    setPhase('verify')
    verifiedCitations = verifyCitations(paperSession.paper.pages, allDraftCitations(analysisResponse.draft))
    review = createReviewState(analysisResponse.draft, reviewerName.value.trim() || 'Human reviewer')
    currentRunId = crypto.randomUUID()
    renderTheory(analysisResponse)
    renderChallenges()
    resultsStage.hidden = false
    resultsStage.scrollIntoView({ behavior: 'smooth', block: 'start' })
    showToast(analysisResponse.analysis.mode === 'mock' ? 'Rehearsal complete. The plumbing works. The scientific claims still need a live extraction and your judgment.' : 'The model drafted the attack. Now the human gets the last word.')
    updateManifest()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Analysis failed.', 'error')
    setPhase('paper')
  } finally {
    analyzeButton.classList.remove('working')
    analyzeButton.querySelector('span')!.textContent = 'Fire the gauntlet'
    analyzeButton.disabled = !analysisConsent.checked
  }
}

function handleReviewAction(button: HTMLButtonElement) {
  if (!review) return
  const challengeId = button.dataset.challenge as ChallengeId
  const field = button.dataset.field as DemandKey | 'verdict'
  const action = button.dataset.reviewAction
  if (action === 'accept') {
    if (field !== 'verdict' && analysisResponse) {
      const draft = analysisResponse.draft.challenges.find(candidate => candidate.challengeId === challengeId)!
      const broken = draft[field].citations.some(citation => verifiedCitations.find(candidate => candidate.id === citation.id)?.verification === 'not_found')
      if (broken) return showToast('The quote is not on the cited page. Revise or reject this field.', 'error')
    }
    commitReviewDecision({ challengeId, field, decision: 'accepted' })
    return renderChallenges()
  }

  const editor = document.querySelector<HTMLElement>(`[data-editor-for="${challengeId}:${field}"]`)
  if (!editor) return
  editor.hidden = false
  editor.dataset.mode = action
  editor.querySelector<HTMLElement>('.revision-input')!.hidden = action === 'reject'
  editor.querySelector<HTMLInputElement>('.revision-reason')!.focus()
}

function saveReview(button: HTMLButtonElement) {
  if (!review) return
  const challengeId = button.dataset.challenge as ChallengeId
  const field = button.dataset.field as DemandKey | 'verdict'
  const editor = button.closest<HTMLElement>('.review-editor')!
  const decision = editor.dataset.mode === 'reject' ? 'rejected' : 'revised'
  const value = editor.querySelector<HTMLTextAreaElement | HTMLSelectElement>('.revision-value')?.value
  const reason = editor.querySelector<HTMLInputElement>('.revision-reason')!.value
  try {
    commitReviewDecision({ challengeId, field, decision, ...(decision === 'revised' ? { adjudicatedValue: value } : {}), reason })
    renderChallenges()
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'That human call could not be saved.', 'error')
  }
}

function commitReviewDecision(update: Parameters<typeof applyReviewDecision>[1]) {
  if (!review || !analysisResponse || !currentRunId) return
  review = applyReviewDecision(review, update)
  const challenge = analysisResponse.draft.challenges.find(candidate => candidate.challengeId === update.challengeId)!
  const modelValue = update.field === 'verdict'
    ? challenge.proposedVerdict
    : fieldText(challenge, update.field)
  const claimId = update.field === 'verdict'
    ? `verdict:${currentRunId}:${update.challengeId}`
    : `claim:${currentRunId}:${update.challengeId}:${update.field}`
  reviewEvents = appendReviewEvent(reviewEvents, {
    eventId: `event:${currentRunId}:${reviewEvents.length + 1}`,
    sequence: reviewEvents.length + 1,
    recordedAt: new Date().toISOString(),
    reviewerAlias: review.reviewer,
    claimId,
    decision: update.decision,
    modelValue,
    ...(update.adjudicatedValue ? { humanValue: update.adjudicatedValue.trim() } : {}),
    ...(update.reason ? { reason: update.reason.trim() } : {})
  })
}

function acceptRemaining() {
  if (!review || !analysisResponse) return
  let next = review
  let skipped = 0
  for (const draft of analysisResponse.draft.challenges) {
    for (const field of reviewFieldKeys()) {
      if (next.challenges[draft.challengeId].fields[field].decision !== 'pending') continue
      const broken = draft[field].citations.some(citation => verifiedCitations.find(candidate => candidate.id === citation.id)?.verification === 'not_found')
      if (broken) skipped += 1
      else {
        review = next
        commitReviewDecision({ challengeId: draft.challengeId, field, decision: 'accepted' })
        next = review!
      }
    }
    if (next.challenges[draft.challengeId].verdict.decision === 'pending') {
      review = next
      commitReviewDecision({ challengeId: draft.challengeId, field: 'verdict', decision: 'accepted' })
      next = review!
    }
  }
  review = next
  renderChallenges()
  showToast(skipped ? `${skipped} ${skipped === 1 ? 'field still needs' : 'fields still need'} a human call because the cited quote was not found.` : 'You accepted every remaining draft with a verified source quote.')
}

async function showEvidence(citationId: string) {
  if (!paperSession) return
  const citation = verifiedCitations.find(candidate => candidate.id === citationId)
  if (!citation) return
  viewerStatus.innerHTML = `<b>PDF PAGE ${citation.pdfPage}</b><span class="${citation.verification}">${citation.verification.replace('_', ' ')}</span>`
  viewerQuote.textContent = citation.quote
  evidenceReturnTarget = document.activeElement instanceof HTMLElement ? document.activeElement : null
  evidenceViewer.hidden = false
  element<HTMLButtonElement>('close-evidence').focus()
  await renderPdfPage(paperSession.document, citation.pdfPage, pdfCanvas, Math.min(720, window.innerWidth - 48))
}

function closeEvidence() {
  evidenceViewer.hidden = true
  evidenceReturnTarget?.focus()
  evidenceReturnTarget = null
}

async function exportArtifact(expectAdjudicated: boolean) {
  if (!paperSession || !analysisResponse || !review) return
  const { pages: _pages, ...paper } = paperSession.paper
  const alphaRun = await createEvaluationRun({
    runId: currentRunId ?? crypto.randomUUID(),
    sourceCommit: __SOURCE_COMMIT__,
    paper,
    benchmark: benchmarkDefinition,
    draft: analysisResponse.draft,
    verifiedCitations,
    review,
    analysis: analysisResponse.analysis
  })
  const run = await normalizeEvaluationRun(alphaRun, reviewEvents)
  if (expectAdjudicated && run.artifactStatus !== 'adjudicated') return showToast('This run is not ready to seal. Finish the review and repair broken citations.', 'error')

  const blob = new Blob([JSON.stringify(run, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = evaluationFileNameV2(run)
  link.click()
  URL.revokeObjectURL(url)
  lastIntegrityDigest = run.integrityDigest
  lastCanonicalRun = run
  setReportAvailability(true)
  collaborationWorkspace.setCanonicalRun(run)
  researchWorkspace.setCanonicalRun(run)
  artifactSummary.textContent = run.summary
  updateManifest()
  showToast(`${run.artifactStatus === 'adjudicated' ? 'Adjudicated' : 'Draft'} evidence artifact exported.`)
}

async function importArtifact(file: File) {
  if (file.size > 5 * 1024 * 1024) return showToast('Evidence artifacts must be 5 MB or smaller.', 'error')
  try {
    const run = await normalizeEvaluationRun(JSON.parse(await file.text()))
    const verdicts = run.stressFractureMap.some(fracture => fracture.humanVerdict)
      ? run.stressFractureMap.map(fracture => `<li><span>${escapeHtml(fracture.challengeId)}</span><b>${escapeHtml(verdictLabels[fracture.humanVerdict ?? 'insufficient_evidence'])}</b></li>`).join('')
      : '<li><span>Human status</span><b>Unadjudicated draft</b></li>'
    importedArtifact.innerHTML = `
      <p class="eyebrow">VERIFIED IMPORT / ${escapeHtml(run.schemaVersion)}</p>
      <h3>${escapeHtml(run.aiDraft.theory.name)}</h3>
      <p>${escapeHtml(run.summary)}</p>
      <ul>${verdicts}</ul>
      <dl><div><dt>Benchmark</dt><dd>${escapeHtml(run.benchmark.definition.version)}</dd></div><div><dt>Integrity digest</dt><dd title="${run.integrityDigest}">${run.integrityDigest.slice(0, 16)}…</dd></div></dl>`
    importedArtifact.hidden = false
    resultsStage.hidden = false
    lastIntegrityDigest = run.integrityDigest
    lastCanonicalRun = run
    setReportAvailability(true)
    collaborationWorkspace.setCanonicalRun(run)
    researchWorkspace.setCanonicalRun(run)
    updateManifest()
    showToast('Artifact schema and SHA-256 integrity digest verified.')
  } catch (error) {
    importedArtifact.hidden = true
    showToast(error instanceof Error ? error.message : 'The evidence artifact is invalid.', 'error')
  } finally {
    artifactInput.value = ''
  }
}

function setReportAvailability(available: boolean) {
  reportActions.querySelectorAll<HTMLButtonElement>('button[data-report]').forEach(button => {
    button.disabled = !available
  })
}

function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

function exportReport(key: keyof ReportBundle) {
  if (!lastCanonicalRun) return
  const reports = generateReportBundle(lastCanonicalRun)
  const slug = lastCanonicalRun.runId
  const definitions: Record<keyof ReportBundle, [string, string]> = {
    labNoteHtml: [`cylon-detector_${slug}_lab-note.html`, 'text/html'],
    methodsHtml: [`cylon-detector_${slug}_methods-evidence.html`, 'text/html'],
    claimLedgerCsv: [`cylon-detector_${slug}_claim-ledger.csv`, 'text/csv'],
    claimLedgerJson: [`cylon-detector_${slug}_claim-ledger.json`, 'application/json'],
    stressFractureJson: [`cylon-detector_${slug}_stress-fracture-map.json`, 'application/json'],
    witnessProtocolsJson: [`cylon-detector_${slug}_witness-protocols.json`, 'application/json']
  }
  const [fileName, type] = definitions[key]
  downloadText(fileName, reports[key], type)
}

dropZone.addEventListener('click', () => paperInput.click())
dropZone.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  paperInput.click()
})
dropZone.addEventListener('dragover', event => { event.preventDefault(); dropZone.classList.add('dragging') })
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'))
dropZone.addEventListener('drop', event => { event.preventDefault(); dropZone.classList.remove('dragging'); const file = event.dataTransfer?.files[0]; if (file) void acquirePaper(file) })
paperInput.addEventListener('change', () => { const file = paperInput.files?.[0]; if (file) void acquirePaper(file) })
analysisConsent.addEventListener('change', () => { analyzeButton.disabled = !analysisConsent.checked || !paperSession })
analyzeButton.addEventListener('click', () => void runAnalysis())
challengeGrid.addEventListener('click', event => {
  const target = event.target as HTMLElement
  const citation = target.closest<HTMLButtonElement>('[data-citation-id]')
  if (citation) return void showEvidence(citation.dataset.citationId!)
  const reviewAction = target.closest<HTMLButtonElement>('[data-review-action]')
  if (reviewAction) return handleReviewAction(reviewAction)
  const save = target.closest<HTMLButtonElement>('.save-review')
  if (save) saveReview(save)
})
theoryClaims.addEventListener('click', event => {
  const citation = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-citation-id]')
  if (citation) void showEvidence(citation.dataset.citationId!)
})
element<HTMLButtonElement>('accept-remaining').addEventListener('click', acceptRemaining)
element<HTMLButtonElement>('save-checkpoint').addEventListener('click', () => void saveLocalCheckpoint())
loadCheckpoint.addEventListener('click', () => void prepareCheckpointResume())
deleteCheckpoint.addEventListener('click', () => void deleteSelectedCheckpoint())
deleteAllCheckpoints.addEventListener('click', () => void deleteEveryCheckpoint())
element<HTMLButtonElement>('close-evidence').addEventListener('click', closeEvidence)
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !evidenceViewer.hidden) closeEvidence()
})
document.querySelectorAll<HTMLInputElement>('input[name="transport"]').forEach(input => {
  input.addEventListener('change', updateManifest)
})
exportDraft.addEventListener('click', () => void exportArtifact(false))
exportFinal.addEventListener('click', () => void exportArtifact(true))
element<HTMLButtonElement>('import-artifact').addEventListener('click', () => artifactInput.click())
artifactInput.addEventListener('change', () => { const file = artifactInput.files?.[0]; if (file) void importArtifact(file) })
reportActions.addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-report]')
  if (button?.dataset.report) exportReport(button.dataset.report as keyof ReportBundle)
})

if (import.meta.env.VITE_USE_ANALYSIS_API === 'true') {
  const serverTransport = document.querySelector<HTMLInputElement>('input[name="transport"][value="server"]')
  if (serverTransport) serverTransport.checked = true
}

void renderCheckpointList()
updateManifest()

const fixturePath = new URLSearchParams(window.location.search).get('fixture')
if (fixturePath) {
  const fixtureUrl = new URL(fixturePath, window.location.origin)
  if (fixtureUrl.origin === window.location.origin && fixtureUrl.pathname.toLowerCase().endsWith('.pdf')) {
    void fetch(fixtureUrl)
      .then(response => {
        if (!response.ok) throw new Error(`Demo fixture returned HTTP ${response.status}`)
        return response.blob()
      })
      .then(blob => acquirePaper(new File([blob], fixtureUrl.pathname.split('/').at(-1) ?? 'theory-paper.pdf', { type: 'application/pdf' })))
      .catch(error => showToast(error instanceof Error ? error.message : 'Demo fixture could not be loaded.', 'error'))
  }
}
