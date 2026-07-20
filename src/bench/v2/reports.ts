import type { EvaluationRunV2 } from './artifact'

export interface ReportBundle {
  labNoteHtml: string
  methodsHtml: string
  claimLedgerCsv: string
  claimLedgerJson: string
  stressFractureJson: string
  witnessProtocolsJson: string
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character] ?? character)
}

function csv(value: unknown): string {
  return JSON.stringify(value === undefined ? '' : typeof value === 'string' ? value : JSON.stringify(value))
}

function documentShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;--ink:#171713;--muted:#66665c;--line:#cbc9bc;--paper:#f7f4e9;--accent:#9c2f18}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 ui-serif,Georgia,serif}main{width:min(1080px,calc(100% - 40px));margin:50px auto}h1,h2,h3{line-height:1.08}h1{font-size:clamp(2.4rem,7vw,5.8rem);margin:.15em 0}h2{margin-top:2.3em;border-top:2px solid var(--ink);padding-top:.45em}.eyebrow,dt,th{font:700 11px/1.2 ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;color:var(--accent)}.summary{font-size:1.3rem;max-width:760px}dl{display:grid;grid-template-columns:repeat(3,1fr);gap:15px}dt{margin-bottom:4px}dd{margin:0;overflow-wrap:anywhere}table{width:100%;border-collapse:collapse;font-size:13px}th,td{border:1px solid var(--line);padding:9px;text-align:left;vertical-align:top}.call{border-left:4px solid var(--accent);padding-left:12px}.quote{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px}.card{border:1px solid var(--line);padding:16px}.digest{font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}@media(max-width:700px){dl{grid-template-columns:1fr}table{display:block;overflow:auto}}@media print{body{background:#fff;font-size:11pt}main{width:100%;margin:0}a{color:inherit;text-decoration:none}h2{break-after:avoid}.card,tr{break-inside:avoid}@page{margin:18mm}}
</style>
</head>
<body><main>${body}</main></body>
</html>`
}

function metadata(run: EvaluationRunV2): string {
  return `<dl>
<div><dt>Receipt</dt><dd>${escapeHtml(run.schemaVersion)}</dd></div>
<div><dt>Benchmark</dt><dd>${escapeHtml(run.benchmark.definition.id)} @ ${escapeHtml(run.benchmark.definition.version)}</dd></div>
<div><dt>Analysis</dt><dd>${escapeHtml(run.analysis.mode)} / ${escapeHtml(run.analysis.provider)} / ${escapeHtml(run.analysis.model)}</dd></div>
<div><dt>Prompt</dt><dd>${escapeHtml(run.analysis.promptVersion)}</dd></div>
<div><dt>Source digest</dt><dd class="digest">${escapeHtml(run.paper.sha256)}</dd></div>
<div><dt>Integrity digest</dt><dd class="digest">${escapeHtml(run.integrityDigest)}</dd></div>
</dl>`
}

function stressCards(run: EvaluationRunV2): string {
  return `<div class="cards">${run.stressFractureMap.map(fracture => `<article class="card">
<p class="eyebrow">${escapeHtml(fracture.challengeId)}</p>
<h3>${escapeHtml(fracture.humanVerdict ?? 'awaiting human call')}</h3>
<p>Machine proposal: ${escapeHtml(fracture.modelVerdict)}</p>
${fracture.humanDecision ? `<p>Human call: ${escapeHtml(fracture.humanDecision)}</p>` : ''}
${fracture.rationale ? `<p>${escapeHtml(fracture.rationale)}</p>` : ''}
</article>`).join('')}</div>`
}

function witnessCards(run: EvaluationRunV2): string {
  return `<div class="cards">${run.witnessProtocols.map(protocol => `<article class="card">
<p class="eyebrow">Witness protocol / ${escapeHtml(protocol.challengeId)}</p>
<h3>${escapeHtml(protocol.observable)}</h3>
<p><b>Prediction:</b> ${escapeHtml(protocol.prediction)}</p>
<p><b>Intervention:</b> ${escapeHtml(protocol.intervention)}</p>
<p><b>Method:</b> ${escapeHtml(protocol.method)}</p>
<p><b>Contrast:</b> ${escapeHtml(protocol.contrast)}</p>
<p><b>Expected signature:</b> ${escapeHtml(protocol.expectedSignature)}</p>
</article>`).join('')}</div>`
}

function ledgerRows(run: EvaluationRunV2): string {
  return run.claimLedger.map(row => {
    const human = row.finalCall
      ? `${row.finalCall.decision}${row.finalCall.value ? `: ${row.finalCall.value}` : ''}${row.finalCall.reason ? ` — ${row.finalCall.reason}` : ''}`
      : 'Awaiting human call'
    const sources = row.sourceQuotes.length
      ? row.sourceQuotes.map(source => `p. ${source.pdfPage}: “${source.quote}” [${source.verification}]`).join('\n')
      : 'No verified source quote'
    return `<tr id="${escapeHtml(row.claimId)}"><td class="digest">${escapeHtml(row.claimId)}</td><td>${escapeHtml(row.challenge.id)} @ ${escapeHtml(row.challenge.version)}</td><td>${escapeHtml(row.demand)}</td><td class="quote">${escapeHtml(sources)}</td><td><b>Machine said</b><br>${escapeHtml(row.modelDraft)}</td><td class="call"><b>Human called</b><br>${escapeHtml(human)}</td></tr>`
  }).join('')
}

function labNote(run: EvaluationRunV2): string {
  return documentShell(`${run.aiDraft.theory.name} — Cylon Detector Lab Note`, `
<p class="eyebrow">Cylon Detector / two-minute Lab Note</p>
<h1>${escapeHtml(run.aiDraft.theory.name)}</h1>
<p class="summary">${escapeHtml(run.summary)}</p>
${metadata(run)}
<h2>Categorical Stress Fracture Map</h2>
${stressCards(run)}
<h2>Witness Protocols</h2>
${witnessCards(run)}
<h2>Method boundary</h2>
<p>This is an evidence receipt, not a consciousness score or automatic verdict. Quoted source matches establish location, not scientific correctness. Human calls remain visible and rejection is a valid result.</p>`)
}

function methods(run: EvaluationRunV2): string {
  const challengeMethods = run.benchmark.challenges.map(challenge => `<article class="card">
<p class="eyebrow">${escapeHtml(challenge.id)} @ ${escapeHtml(challenge.version)}</p>
<h3>${escapeHtml(challenge.title)}</h3>
<p>${escapeHtml(challenge.phenomenon)}</p>
<p><b>Assumptions:</b> ${escapeHtml(challenge.assumptions.join(' / '))}</p>
<p><b>Known confounds:</b> ${escapeHtml(challenge.knownConfounds.join(' / '))}</p>
<p><b>What would change our minds:</b> ${escapeHtml(challenge.changeMindObservation)}</p>
</article>`).join('')
  const history = run.reviewEvents.length
    ? `<ol>${run.reviewEvents.map(event => `<li><span class="digest">${escapeHtml(event.eventId)}</span> — ${escapeHtml(event.reviewerAlias)} ${escapeHtml(event.decision)} ${escapeHtml(event.claimId)}${event.reason ? `: ${escapeHtml(event.reason)}` : ''}</li>`).join('')}</ol>`
    : '<p>No human review events recorded.</p>'
  return documentShell(`${run.aiDraft.theory.name} — Methods and Evidence`, `
<p class="eyebrow">Cylon Detector / Methods and Evidence</p>
<h1>${escapeHtml(run.aiDraft.theory.name)}</h1>
<p class="summary">${escapeHtml(run.summary)}</p>
${metadata(run)}
<h2>Benchmark challenges</h2><div class="cards">${challengeMethods}</div>
<h2>Claim Ledger</h2>
<table><thead><tr><th>Stable claim ID</th><th>Challenge</th><th>Demand</th><th>Source quote</th><th>Machine said</th><th>Human called</th></tr></thead><tbody>${ledgerRows(run)}</tbody></table>
<h2>Append-only human history</h2>${history}
<h2>Categorical Stress Fracture Map</h2>${stressCards(run)}
<h2>Witness Protocol cards</h2>${witnessCards(run)}
<h2>Receipt boundary</h2><p>The integrity digest shows whether these bytes changed. It does not authenticate reviewer identity. This report reproduces the sealed receipt and does not independently regenerate scientific prose.</p>`)
}

function claimLedgerCsv(run: EvaluationRunV2): string {
  const header = ['claimId', 'challengeId', 'challengeVersion', 'demand', 'sourceQuotes', 'modelDraft', 'humanDecision', 'humanValue', 'humanReason', 'humanEventIds']
  const rows = run.claimLedger.map(row => [
    row.claimId,
    row.challenge.id,
    row.challenge.version,
    row.demand,
    row.sourceQuotes,
    row.modelDraft,
    row.finalCall?.decision,
    row.finalCall?.value,
    row.finalCall?.reason,
    row.humanEventIds
  ].map(csv).join(','))
  return `${header.map(csv).join(',')}\n${rows.join('\n')}\n`
}

export function generateReportBundle(run: EvaluationRunV2): ReportBundle {
  return {
    labNoteHtml: labNote(run),
    methodsHtml: methods(run),
    claimLedgerCsv: claimLedgerCsv(run),
    claimLedgerJson: `${JSON.stringify(run.claimLedger, null, 2)}\n`,
    stressFractureJson: `${JSON.stringify(run.stressFractureMap, null, 2)}\n`,
    witnessProtocolsJson: `${JSON.stringify(run.witnessProtocols, null, 2)}\n`
  }
}
