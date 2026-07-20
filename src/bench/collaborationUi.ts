import {
  createBlindReviewPacket,
  createProvenanceEnvelope,
  generateThreeVoiceReport,
  lockBlindContribution,
  mergeReviewContributions,
  revealContribution,
  validateBlindReviewPacket,
  validateProvenanceEnvelope,
  validateReviewContribution,
  type BlindReviewPacket,
  type ProvenanceEnvelope,
  type ReviewBundle,
  type ReviewCall,
  type ReviewContribution
} from './collaboration'
import type { EvaluationRunV2 } from './v2/artifact'

function element<T extends HTMLElement>(id: string): T {
  const value = document.getElementById(id)
  if (!value) throw new Error(`Missing #${id}`)
  return value as T
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character)
}

function download(fileName: string, value: unknown, type = 'application/json') {
  const content = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

async function readJson(file: File): Promise<unknown> {
  if (file.size > 5 * 1024 * 1024) throw new Error('Portable review files must be 5 MB or smaller')
  return JSON.parse(await file.text()) as unknown
}

function callForm(packet: BlindReviewPacket, prior?: ReviewCall[]): string {
  const priorById = new Map(prior?.map(call => [call.blindClaimId, call]))
  return packet.commitments.map(commitment => {
    const call = priorById.get(commitment.blindClaimId)
    return `<article class="portable-call" data-blind-id="${escapeHtml(commitment.blindClaimId)}">
<p class="eyebrow">${escapeHtml(commitment.challengeId)} / ${escapeHtml(commitment.demand)}</p>
<p>${escapeHtml(commitment.commitment)}</p>
<div class="portable-call-grid">
<label>Judgment<select data-call="judgment">
${['supported', 'strained', 'unsupported', 'insufficient_evidence'].map(value => `<option value="${value}" ${call?.judgment === value ? 'selected' : ''}>${value.replace('_', ' ')}</option>`).join('')}
</select></label>
<label>Confidence<select data-call="confidence">
${['low', 'medium', 'high'].map(value => `<option value="${value}" ${call?.confidence === value ? 'selected' : ''}>${value}</option>`).join('')}
</select></label>
<label>Human reason<input data-call="reason" value="${escapeHtml(call?.reason ?? '')}" placeholder="Why this call?" required></label>
</div></article>`
  }).join('')
}

function readCalls(container: HTMLElement, responseTimeMs: number): ReviewCall[] {
  return [...container.querySelectorAll<HTMLElement>('.portable-call')].map(row => {
    const reason = row.querySelector<HTMLInputElement>('[data-call="reason"]')?.value.trim() ?? ''
    if (!reason) throw new Error('Every portable review call requires a human reason')
    return {
      blindClaimId: row.dataset.blindId!,
      judgment: row.querySelector<HTMLSelectElement>('[data-call="judgment"]')!.value as ReviewCall['judgment'],
      confidence: row.querySelector<HTMLSelectElement>('[data-call="confidence"]')!.value as ReviewCall['confidence'],
      responseTimeMs: Math.max(0, Math.round(responseTimeMs)),
      reason
    }
  })
}

export function mountCollaborationWorkspace(showToast: (message: string, tone?: 'normal' | 'error') => void) {
  let canonicalRun: EvaluationRunV2 | null = null
  let packet: BlindReviewPacket | null = null
  let contribution: ReviewContribution | null = null
  let envelope: ProvenanceEnvelope | null = null
  let bundle: ReviewBundle | null = null
  let blindStartedAt = performance.now()
  let revealStartedAt = performance.now()

  const status = element<HTMLElement>('collaboration-status')
  const blindForm = element<HTMLElement>('blind-review-form')
  const revealForm = element<HTMLElement>('revealed-review-form')
  const revealPanel = element<HTMLElement>('provenance-reveal')
  const disagreementView = element<HTMLElement>('disagreement-view')
  const packetButton = element<HTMLButtonElement>('export-blind-packet')
  const envelopeButton = element<HTMLButtonElement>('export-provenance-envelope')
  const lockButton = element<HTMLButtonElement>('lock-blind-calls')
  const revealButton = element<HTMLButtonElement>('export-revealed-contribution')
  const mergeButton = element<HTMLButtonElement>('merge-contributions')
  const threeVoiceButton = element<HTMLButtonElement>('export-three-voice')

  function coordinatorReady() {
    packetButton.disabled = !canonicalRun
    envelopeButton.disabled = !canonicalRun
    mergeButton.disabled = !packet
    threeVoiceButton.disabled = !packet || !bundle
  }

  async function ensurePacket(): Promise<BlindReviewPacket> {
    if (packet) return packet
    if (!canonicalRun) throw new Error('Seal or import a canonical receipt first')
    packet = await createBlindReviewPacket(canonicalRun, element<HTMLInputElement>('blind-alias').value.trim() || 'Blinded theory')
    coordinatorReady()
    return packet
  }

  function loadReviewerPacket(next: BlindReviewPacket) {
    packet = next
    blindForm.innerHTML = callForm(next)
    blindStartedAt = performance.now()
    lockButton.disabled = false
    status.textContent = 'BLIND ROUND / PARTIAL BLINDING DISCLOSED / FIRST CALLS NOT YET LOCKED'
    coordinatorReady()
  }

  packetButton.addEventListener('click', () => void (async () => {
    try {
      const next = await ensurePacket()
      download(`cylon-detector_${next.packetId}_blind-packet.json`, next)
      status.textContent = 'BLIND PACKET EXPORTED / EVIDENCE REDACTED / DIGEST BINDINGS RETAINED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Blind packet failed', 'error') }
  })())

  envelopeButton.addEventListener('click', () => void (async () => {
    try {
      if (!canonicalRun) throw new Error('Seal or import a canonical receipt first')
      const nextPacket = await ensurePacket()
      envelope = await createProvenanceEnvelope(canonicalRun, nextPacket)
      download(`cylon-detector_${nextPacket.packetId}_provenance-envelope.json`, envelope)
      status.textContent = 'PROVENANCE ENVELOPE EXPORTED / SHARE ONLY AFTER FIRST-CALL LOCK'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Provenance export failed', 'error') }
  })())

  async function importPacket(file: File) {
    const next = await validateBlindReviewPacket(await readJson(file))
    loadReviewerPacket(next)
  }

  element<HTMLInputElement>('blind-packet-input').addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) void importPacket(file).catch(error => showToast(error instanceof Error ? error.message : 'Packet import failed', 'error'))
  })
  element<HTMLInputElement>('review-packet-input').addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (file) void importPacket(file).catch(error => showToast(error instanceof Error ? error.message : 'Packet import failed', 'error'))
  })

  lockButton.addEventListener('click', () => void (async () => {
    try {
      if (!packet) throw new Error('Import a blind packet first')
      const calls = readCalls(blindForm, performance.now() - blindStartedAt)
      const reviewer = element<HTMLInputElement>('independent-reviewer-alias').value.trim() || 'Independent reviewer'
      contribution = await lockBlindContribution(packet, reviewer, calls)
      download(`cylon-detector_${contribution.contributionId}_blind-contribution.json`, contribution)
      status.textContent = 'FIRST CALLS LOCKED + DIGESTED / PROVENANCE MAY NOW BE REVEALED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Blind calls could not be locked', 'error') }
  })())

  element<HTMLInputElement>('review-contribution-input').addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    void (async () => {
      contribution = await validateReviewContribution(await readJson(file))
      status.textContent = 'LOCKED CONTRIBUTION IMPORTED / PROVENANCE ENVELOPE REQUIRED'
    })().catch(error => showToast(error instanceof Error ? error.message : 'Contribution import failed', 'error'))
  })

  element<HTMLInputElement>('provenance-envelope-input').addEventListener('change', event => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return
    void (async () => {
      if (!contribution) throw new Error('Lock or import the first-round contribution before reveal')
      envelope = await validateProvenanceEnvelope(await readJson(file))
      if (envelope.packetIntegrityDigest !== contribution.packetIntegrityDigest) throw new Error('Envelope and contribution belong to different packets')
      if (!packet) throw new Error('Import the blind packet before its provenance envelope')
      revealPanel.innerHTML = `<p class="eyebrow">PROVENANCE REVEALED / ${escapeHtml(envelope.theoryName)}</p><p>${escapeHtml(envelope.paper.title ?? envelope.paper.fileName)} / ${escapeHtml(envelope.paper.authors?.join(', ') ?? 'authors unavailable')} / ${escapeHtml(envelope.paper.doi ?? 'DOI unavailable')}</p><p>${escapeHtml(envelope.analysisIdentity.provider)} / ${escapeHtml(envelope.analysisIdentity.model)} / ${envelope.evidence.reduce((total, item) => total + item.sources.length, 0)} verified source locations</p>`
      revealPanel.hidden = false
      revealForm.innerHTML = callForm(packet, contribution.blindLock.calls)
      revealStartedAt = performance.now()
      revealButton.disabled = false
      status.textContent = 'PROVENANCE REVEALED / SECOND CALLS REMAIN INDEPENDENT'
    })().catch(error => showToast(error instanceof Error ? error.message : 'Provenance reveal failed', 'error'))
  })

  revealButton.addEventListener('click', () => void (async () => {
    try {
      if (!contribution || !envelope) throw new Error('Locked calls and a matching provenance envelope are required')
      const calls = readCalls(revealForm, performance.now() - revealStartedAt)
      contribution = await revealContribution(contribution, envelope, calls)
      download(`cylon-detector_${contribution.contributionId}_provenance-delta.json`, contribution)
      status.textContent = 'PROVENANCE DELTA EXPORTED / CHANGED AND UNCHANGED CALLS RETAINED'
    } catch (error) { showToast(error instanceof Error ? error.message : 'Provenance Delta failed', 'error') }
  })())

  element<HTMLInputElement>('bundle-contributions-input').addEventListener('change', event => {
    const files = [...((event.target as HTMLInputElement).files ?? [])]
    mergeButton.disabled = !packet || files.length === 0
  })

  mergeButton.addEventListener('click', () => void (async () => {
    try {
      if (!packet) throw new Error('Import the shared blind packet first')
      const files = [...(element<HTMLInputElement>('bundle-contributions-input').files ?? [])]
      if (!files.length) throw new Error('Select one or more review contributions')
      const contributions = await Promise.all(files.map(async file => validateReviewContribution(await readJson(file))))
      bundle = await mergeReviewContributions(packet, contributions)
      download(`cylon-detector_${bundle.bundleId}_review-bundle.json`, bundle)
      disagreementView.innerHTML = `<p class="eyebrow">DISAGREEMENT VIEW / NO AVERAGING</p>${bundle.disagreements.map(disagreement => `<article><b>${escapeHtml(disagreement.blindClaimId)}</b><ul>${disagreement.calls.map(call => `<li>${escapeHtml(call.reviewerAlias)}: ${escapeHtml(call.judgment)} / ${escapeHtml(call.confidence)} — ${escapeHtml(call.reason)}</li>`).join('')}</ul></article>`).join('')}`
      status.textContent = 'REVIEW BUNDLE EXPORTED / DISSENT PRESERVED AS SEPARATE CALLS'
      coordinatorReady()
    } catch (error) { showToast(error instanceof Error ? error.message : 'Review merge failed', 'error') }
  })())

  threeVoiceButton.addEventListener('click', () => {
    if (!packet || !bundle) return
    const response = element<HTMLTextAreaElement>('proponent-response').value.trim() || 'No theory proponent response supplied.'
    const report = generateThreeVoiceReport(packet, bundle, response, envelope?.theoryName ?? packet.alias)
    download(`cylon-detector_${bundle.bundleId}_three-voice.html`, report, 'text/html')
    status.textContent = 'THREE-VOICE REPORT EXPORTED / NEUTRAL, PROPONENT, REVIEWER SECTIONS KEPT SEPARATE'
  })

  coordinatorReady()
  return {
    setCanonicalRun(run: EvaluationRunV2) {
      canonicalRun = run
      packet = null
      envelope = null
      bundle = null
      coordinatorReady()
      status.textContent = 'CANONICAL RECEIPT READY / BLIND PACKET MAY BE CREATED LOCALLY'
    }
  }
}
