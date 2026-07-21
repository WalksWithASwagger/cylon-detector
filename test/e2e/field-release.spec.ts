import { expect, test, type Locator, type Page } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  FIELD_EVIDENCE_CHECK_IDS,
  assertNoForbiddenPaperTraffic,
  assertPacketDigest,
  assertResumeDigestMatch,
  computePacketDigest,
  sha256File,
  validateFieldEvidence,
  validateFieldEvidencePacket,
  verifyBoundFile,
  type FieldEvidenceCheck,
  type FieldEvidenceManifest,
  type NetworkEvidence
} from '../../scripts/validate-field-evidence'

const evidenceDirectory = new URL('../../test-results/field-evidence/', import.meta.url)
const sourceSentence = 'Conscious experience depends on a recurrent witness process that integrates sensory evidence before deliberate report.'

function pdfFixture(text: string): Buffer {
  const escaped = text.replace(/([\\()])/g, '\\$1')
  const content = `BT /F1 14 Tf 72 720 Td (${escaped}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`
  ]

  let source = '%PDF-1.4\n'
  const offsets = [0]
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source))
    source += `${index + 1} 0 obj\n${object}\nendobj\n`
  })
  const xrefOffset = Buffer.byteLength(source)
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  source += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  source += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  return Buffer.from(source)
}

function pass(id: string, detail: string): FieldEvidenceCheck {
  return { id, status: 'pass', detail }
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return { width: view.getUint32(16), height: view.getUint32(20) }
}

async function keyboardActivate(target: Locator): Promise<boolean> {
  await expect(target).toHaveAccessibleName(/\S/)
  await target.focus()
  const focusVisible = await target.evaluate(element => element.matches(':focus-visible'))
  await target.press('Enter')
  return focusVisible
}

async function mobileContainmentIssues(page: Page): Promise<string[]> {
  const selectors = ['#bench-title', '.hero > p', '.hero-warning', '#paper-heading', '#drop-zone', '#artifact-heading', '#import-artifact']
  return page.evaluate(items => items.flatMap(selector => {
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) return [`${selector}: missing`]
    const issues: string[] = []
    const viewportWidth = window.innerWidth
    const elementRect = element.getBoundingClientRect()
    if (elementRect.left < -1 || elementRect.right > viewportWidth + 1) {
      issues.push(`${selector}: element bounds ${elementRect.left.toFixed(1)}..${elementRect.right.toFixed(1)} outside 0..${viewportWidth}`)
    }
    const range = document.createRange()
    range.selectNodeContents(element)
    for (const rect of range.getClientRects()) {
      if (rect.left < -1 || rect.right > viewportWidth + 1) {
        issues.push(`${selector}: content bounds ${rect.left.toFixed(1)}..${rect.right.toFixed(1)} outside 0..${viewportWidth}`)
      }
    }
    if (element.scrollWidth > element.clientWidth + 1) {
      issues.push(`${selector}: content width ${element.scrollWidth} exceeds visible width ${element.clientWidth}`)
    }
    return issues
  }), selectors)
}

test('field evidence guards reject tampering, privacy traffic, duplicate screenshots, and dirty-state lies', async ({}, testInfo) => {
  const injected: NetworkEvidence[] = [
    { method: 'GET', url: 'https://api.mixpanel.com/track' },
    { method: 'POST', url: 'https://storage.example.test/put', body: Buffer.from(sourceSentence).toString('base64') },
    { method: 'POST', url: 'http://127.0.0.1:4174/api/submit', body: 'acquisition-time feedback probe' }
  ]
  expect(() => assertNoForbiddenPaperTraffic(injected)).toThrow(/analytics/i)
  expect(() => assertNoForbiddenPaperTraffic(injected.slice(1))).toThrow(/storage/i)
  expect(() => assertNoForbiddenPaperTraffic(injected.slice(2))).toThrow(/feedback/i)
  expect(() => assertResumeDigestMatch('a'.repeat(64), 'b'.repeat(64))).toThrow(/digest mismatch/i)

  const boundPath = testInfo.outputPath('bound.txt')
  await writeFile(boundPath, 'original bytes')
  const expectedFileDigest = await sha256File(boundPath)
  await verifyBoundFile(testInfo.outputDir, { path: 'bound.txt', sha256: expectedFileDigest }, 'test file')
  await writeFile(boundPath, 'changed bytes')
  await expect(verifyBoundFile(testInfo.outputDir, { path: 'bound.txt', sha256: expectedFileDigest }, 'test file')).rejects.toThrow(/digest mismatch/i)

  const clean = false
  const base = {
    schemaVersion: 'cylon-field-evidence/v1',
    generatedAt: '2020-01-01T00:00:00.000Z',
    sourceCommit: 'a'.repeat(40),
    workingTreeDirty: clean,
    browser: 'chromium',
    viewports: [
      { label: 'desktop', width: 1280, height: 800, zoomPercent: 100 },
      { label: 'mobile', width: 375, height: 812, zoomPercent: 100 },
      { label: 'css-zoom-proxy', width: 1280, height: 800, zoomPercent: 200 }
    ],
    analysis: { channel: 'local-rehearsal', mode: 'mock', provider: 'local', model: 'fixture' },
    source: { kind: 'synthetic-pdf' },
    benchmarkDigest: 'b'.repeat(64),
    artifactDigest: 'c'.repeat(64),
    privacy: { forbiddenPaperRequests: [], externalRequestsBlocked: 0, totalRequests: 1 },
    files: {
      sourcePdf: { path: 'source.pdf', sha256: 'd'.repeat(64) },
      receipt: { path: 'receipt.json', sha256: 'e'.repeat(64) },
      staticReport: { path: 'report.html', sha256: 'f'.repeat(64) },
      desktopScreenshot: { path: 'desktop.png', sha256: '1'.repeat(64), width: 1280, height: 900 },
      mobileScreenshot: { path: 'mobile.png', sha256: '2'.repeat(64), width: 375, height: 1200 }
    },
    checks: FIELD_EVIDENCE_CHECK_IDS.map(id => pass(id, `${id} evidence`))
  } satisfies Omit<FieldEvidenceManifest, 'packetDigest'>
  const valid = { ...base, packetDigest: await computePacketDigest(base) }
  expect(validateFieldEvidence(valid, { expectedCommit: base.sourceCommit, expectedWorkingTreeDirty: clean })).toBeTruthy()

  const changedDate = { ...valid, generatedAt: '1999-01-01T00:00:00.000Z' }
  await expect(assertPacketDigest(changedDate)).rejects.toThrow(/packet digest mismatch/i)
  const archival = { ...changedDate, packetDigest: await computePacketDigest(changedDate) }
  expect(validateFieldEvidence(archival)).toBeTruthy()
  await expect(assertPacketDigest(archival)).resolves.toBeUndefined()

  const changedDigest = { ...valid, artifactDigest: '3'.repeat(64) }
  await expect(assertPacketDigest(changedDigest)).rejects.toThrow(/packet digest mismatch/i)
  expect(() => validateFieldEvidence(valid, { expectedWorkingTreeDirty: !clean })).toThrow(/working tree state/i)
  expect(() => validateFieldEvidence({
    ...valid,
    files: { ...valid.files, mobileScreenshot: { ...valid.files.mobileScreenshot, path: valid.files.desktopScreenshot.path } }
  })).toThrow(/screenshot paths.*distinct/i)
})

test('records the deterministic stranger journey as field-release evidence', async ({ browser, page }, testInfo) => {
  test.setTimeout(90_000)
  const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const workingTreeDirty = execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim().length > 0
  const malformedPath = testInfo.outputPath('malformed.pdf')
  const paperPath = testInfo.outputPath('synthetic-witness.pdf')
  const mismatchedPath = testInfo.outputPath('synthetic-mismatch.pdf')
  await writeFile(malformedPath, Buffer.from('not a pdf'))
  await writeFile(paperPath, pdfFixture(sourceSentence))
  await writeFile(mismatchedPath, pdfFixture(`${sourceSentence} This changes the source digest.`))
  await rm(evidenceDirectory, { recursive: true, force: true })
  await mkdir(evidenceDirectory, { recursive: true })

  const traffic: NetworkEvidence[] = []
  await page.context().route('**/*', async route => {
    const request = route.request()
    traffic.push({
      method: request.method(),
      url: request.url(),
      body: request.postData() ?? undefined
    })
    const url = new URL(request.url())
    if (url.origin !== 'http://127.0.0.1:4174') return route.abort('blockedbyclient')
    return route.continue()
  })

  const checks: FieldEvidenceCheck[] = []
  const focusVisibleResults: boolean[] = []
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/bench')

  await page.locator('#paper-input').setInputFiles(malformedPath)
  await expect(page.locator('#drop-status')).toContainText('SOURCE REJECTED')
  checks.push(pass('malformed-pdf', 'Malformed bytes were rejected before analysis.'))

  await page.locator('#paper-input').setInputFiles(paperPath)
  await expect(page.locator('#drop-status')).toHaveText('LOCAL PARSE / COMPLETE')
  await expect(page.locator('#manifest-source')).toContainText(/1 page/i)
  checks.push(pass('valid-pdf', 'A one-page synthetic PDF was parsed and hashed locally.'))

  const analysisConsent = page.locator('#analysis-consent')
  await expect(analysisConsent).toHaveAccessibleName(/I have the right to process this paper/i)
  await analysisConsent.focus()
  focusVisibleResults.push(await analysisConsent.evaluate(element => element.matches(':focus-visible')))
  await page.keyboard.press('Space')
  focusVisibleResults.push(await keyboardActivate(page.locator('#analyze-button')))
  await expect(page.locator('#manifest-analysis')).toContainText(/mock/i)
  await expect(page.locator('.challenge-chamber')).toHaveCount(3)

  const citation = page.locator('.citation-chip').first()
  focusVisibleResults.push(await keyboardActivate(citation))
  await expect(page.locator('#evidence-viewer')).toBeVisible()
  await expect(page.locator('#viewer-status')).toContainText(/exact|normalized/i)
  await page.keyboard.press('Escape')
  await expect(page.locator('#evidence-viewer')).toBeHidden()
  await expect(citation).toBeFocused()
  checks.push(pass('citation-verification', 'A located source quote opened on its synthetic PDF page and returned focus.'))

  focusVisibleResults.push(await keyboardActivate(page.locator('[data-review-action="reject"][data-challenge="provenance-flip"][data-field="mechanism"]')))
  const rejectionEditor = page.locator('[data-editor-for="provenance-flip:mechanism"]')
  await rejectionEditor.locator('.revision-reason').pressSequentially('The proposed mechanism does not separate experience from later report.')
  focusVisibleResults.push(await keyboardActivate(rejectionEditor.locator('.save-review')))
  focusVisibleResults.push(await keyboardActivate(page.locator('#accept-remaining')))
  await expect(page.locator('#review-resolved')).toHaveText('18')
  await expect(page.locator('.decision-state.rejected').first()).toContainText('rejected')
  checks.push(pass('human-rejection', 'The human rejection remained visible and the remaining calls were adjudicated.'))

  focusVisibleResults.push(await keyboardActivate(page.locator('#save-checkpoint')))
  await expect(page.locator('#checkpoint-resume-status')).toContainText('CHECKPOINT SAVED')
  await page.reload()
  await expect(page.locator('#checkpoint-list option')).toHaveCount(1)
  focusVisibleResults.push(await keyboardActivate(page.locator('#load-checkpoint')))
  await page.locator('#paper-input').setInputFiles(mismatchedPath)
  await expect(page.locator('#checkpoint-resume-status')).toContainText('HASH MISMATCH / REVIEW NOT RESTORED')
  checks.push(pass('checkpoint-resume-mismatch', 'A changed synthetic source did not reconnect to the saved review.'))
  await page.locator('#paper-input').setInputFiles(paperPath)
  await expect(page.locator('#checkpoint-resume-status')).toContainText('HASH MATCH / REVIEW RESTORED')
  await expect(page.locator('.decision-state.rejected').first()).toContainText('rejected')
  checks.push(pass('checkpoint-resume-match', 'The original source digest restored the human review.'))

  const receiptDownload = page.waitForEvent('download')
  focusVisibleResults.push(await keyboardActivate(page.locator('#export-final')))
  const receiptPath = await (await receiptDownload).path()
  expect(receiptPath).not.toBeNull()
  const receipt = JSON.parse(await readFile(receiptPath!, 'utf8'))
  expect(receipt.sourceCommit).toBe(sourceCommit)
  expect(receipt.analysis).toMatchObject({ mode: 'mock', provider: 'local', store: false })
  expect(receipt.reviewEvents.some((event: { decision: string }) => event.decision === 'rejected')).toBe(true)

  const reportDownload = page.waitForEvent('download')
  focusVisibleResults.push(await keyboardActivate(page.locator('[data-report="methodsHtml"]')))
  const reportPath = await (await reportDownload).path()
  expect(reportPath).not.toBeNull()
  const report = await readFile(reportPath!, 'utf8')
  const staticContext = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await staticContext.newPage()
  await staticPage.goto(pathToFileURL(reportPath!).href)
  await expect(staticPage.locator('body')).toContainText('Machine said')
  await expect(staticPage.locator('body')).toContainText('Human called')
  expect(report).not.toMatch(/<script/i)
  await staticContext.close()
  checks.push(pass('static-report-no-js', 'The Methods and Evidence report rendered required content with JavaScript disabled.'))

  const receiptChooser = page.waitForEvent('filechooser')
  focusVisibleResults.push(await keyboardActivate(page.locator('#import-artifact')))
  await (await receiptChooser).setFiles(receiptPath!)
  await expect(page.locator('#imported-artifact')).toContainText('VERIFIED IMPORT')
  checks.push(pass('receipt-import', 'The exported canonical receipt passed schema and integrity verification on import.'))

  const statusSemantics = await page.locator('#drop-status').evaluate(element => ({
    role: element.getAttribute('role'),
    live: element.getAttribute('aria-live')
  }))
  expect(statusSemantics).toEqual({ role: 'status', live: 'polite' })
  await expect(page.locator('#review-progress')).toHaveAttribute('role', 'progressbar')
  await expect(page.locator('#review-progress')).toHaveAccessibleName('Human review progress')
  await expect(page.locator('#review-progress')).toHaveAttribute('aria-valuenow', '18')
  checks.push(pass('accessibility-semantics-proxy', 'DOM semantics expose a polite live status and a named progressbar; this is not an assistive-technology pass.'))
  expect(focusVisibleResults.every(Boolean)).toBe(true)
  checks.push(pass('focus-visible-proxy', `${focusVisibleResults.length} critical controls matched :focus-visible before keyboard activation.`))
  checks.push(pass('keyboard-critical-path', 'Consent, analysis, citation, rejection, checkpoint, export, report, and receipt import controls were keyboard activated.'))

  const transitionSeconds = await page.locator('#review-progress').evaluate(element => Number.parseFloat(getComputedStyle(element).transitionDuration))
  expect(transitionSeconds).toBeLessThanOrEqual(0.001)
  checks.push(pass('reduced-motion-proxy', 'Browser media emulation reduced the computed progress transition to at most 1 millisecond.'))

  const desktopScreenshot = new URL('desktop.png', evidenceDirectory)
  const desktopBytes = await page.screenshot({ path: fileURLToPath(desktopScreenshot), fullPage: true })
  await page.setViewportSize({ width: 375, height: 812 })
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(mobileOverflow).toBeLessThanOrEqual(1)
  const mobileScreenshot = new URL('mobile.png', evidenceDirectory)
  const mobileBytes = await page.screenshot({ path: fileURLToPath(mobileScreenshot), fullPage: true })
  checks.push(pass('mobile-layout-proxy', 'The document scroll width fit the 375 by 812 viewport; critical content containment is checked separately.'))
  const containmentIssues = await mobileContainmentIssues(page)
  checks.push({
    id: 'mobile-critical-containment',
    status: containmentIssues.length === 0 ? 'pass' : 'fail',
    detail: containmentIssues.length === 0 ? 'Critical element and text bounds fit the mobile viewport.' : containmentIssues.join('; ')
  })

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(zoomOverflow).toBeLessThanOrEqual(1)
  checks.push(pass('css-zoom-layout-proxy', 'CSS zoom produced no document overflow; native browser zoom remains manual QA.'))

  page.once('dialog', dialog => dialog.accept())
  focusVisibleResults.push(await keyboardActivate(page.locator('#delete-all-checkpoints')))
  await expect(page.locator('#checkpoint-list option')).toHaveCount(0)
  checks.push(pass('local-data-deletion', 'Delete all local runs emptied the checkpoint index.'))

  assertNoForbiddenPaperTraffic(traffic)
  checks.push(pass('privacy-network', 'No analytics, feedback, or storage request was attempted anywhere in the mock bench run, regardless of timing or body.'))

  const sourcePacket = new URL('synthetic-source.pdf', evidenceDirectory)
  const receiptPacket = new URL('canonical-receipt.json', evidenceDirectory)
  const reportPacket = new URL('methods-evidence.html', evidenceDirectory)
  await copyFile(paperPath, sourcePacket)
  await copyFile(receiptPath!, receiptPacket)
  await copyFile(reportPath!, reportPacket)
  const desktopDimensions = pngDimensions(desktopBytes)
  const mobileDimensions = pngDimensions(mobileBytes)
  const unsignedManifest = {
    schemaVersion: 'cylon-field-evidence/v1',
    generatedAt: new Date().toISOString(),
    sourceCommit,
    workingTreeDirty,
    browser: testInfo.project.name,
    viewports: [
      { label: 'desktop', width: 1280, height: 800, zoomPercent: 100 },
      { label: 'mobile', width: 375, height: 812, zoomPercent: 100 },
      { label: 'css-zoom-proxy', width: 1280, height: 800, zoomPercent: 200 }
    ],
    analysis: { channel: 'local-rehearsal', mode: receipt.analysis.mode, provider: receipt.analysis.provider, model: receipt.analysis.model },
    source: { kind: 'synthetic-pdf' },
    benchmarkDigest: receipt.benchmark.definition.integrityDigest,
    artifactDigest: receipt.integrityDigest,
    privacy: {
      forbiddenPaperRequests: [],
      externalRequestsBlocked: traffic.filter(request => new URL(request.url).origin !== 'http://127.0.0.1:4174').length,
      totalRequests: traffic.length
    },
    files: {
      sourcePdf: { path: 'synthetic-source.pdf', sha256: await sha256File(fileURLToPath(sourcePacket)) },
      receipt: { path: 'canonical-receipt.json', sha256: await sha256File(fileURLToPath(receiptPacket)) },
      staticReport: { path: 'methods-evidence.html', sha256: await sha256File(fileURLToPath(reportPacket)) },
      desktopScreenshot: { path: 'desktop.png', sha256: await sha256File(fileURLToPath(desktopScreenshot)), ...desktopDimensions },
      mobileScreenshot: { path: 'mobile.png', sha256: await sha256File(fileURLToPath(mobileScreenshot)), ...mobileDimensions }
    },
    checks
  } satisfies Omit<FieldEvidenceManifest, 'packetDigest'>
  const manifest = { ...unsignedManifest, packetDigest: await computePacketDigest(unsignedManifest) }
  await writeFile(new URL('manifest.json', evidenceDirectory), `${JSON.stringify(manifest, null, 2)}\n`)
  expect(containmentIssues, `Critical mobile content is clipped:\n${containmentIssues.join('\n')}`).toEqual([])
  await validateFieldEvidencePacket(fileURLToPath(new URL('manifest.json', evidenceDirectory)), {
    expectedCommit: sourceCommit,
    expectedWorkingTreeDirty: workingTreeDirty
  })
})
