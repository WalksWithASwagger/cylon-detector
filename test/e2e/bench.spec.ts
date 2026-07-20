import { expect, test } from '@playwright/test'
import { readFile, writeFile } from 'node:fs/promises'

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

test('runs the local gauntlet, preserves a human revision, and re-opens the artifact', async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath('witness-theory.pdf')
  await writeFile(pdfPath, pdfFixture(
    'Conscious experience depends on a recurrent witness process that integrates sensory evidence before deliberate report.'
  ))

  let analysisRequests = 0
  page.on('request', request => {
    if (request.url().includes('/api/analyze')) analysisRequests += 1
  })

  await page.goto('/bench')
  await page.locator('#paper-input').setInputFiles(pdfPath)
  await expect(page.locator('#drop-status')).toHaveText('LOCAL PARSE / COMPLETE')
  await expect(page.locator('#paper-title')).toHaveValue('witness-theory')
  await expect(page.locator('#paper-readout')).toContainText('PDF pages1')
  await expect(page.locator('#paper-readout')).not.toContainText('e3b0c44298fc1c14')
  await expect(page.locator('#manifest-source')).toContainText(/1 page/i)
  expect(analysisRequests).toBe(0)

  await page.locator('#paper-title').fill('Witness Theory')
  await page.locator('#paper-authors').fill('Ada Witness; Kris Krüg')
  await page.locator('#paper-year').fill('2026')
  await page.locator('#paper-doi').fill('10.0000/witness.alpha')
  await page.locator('#reviewer-name').fill('Kris Krüg')
  await page.locator('#analysis-consent').check()
  await page.locator('#analyze-button').click()
  await expect(page.locator('.challenge-chamber')).toHaveCount(3)
  await expect(page.locator('.demand-card')).toHaveCount(15)
  await expect(page.locator('#claim-ledger-preview tbody tr')).toHaveCount(15)
  await expect(page.locator('#manifest-analysis')).toContainText(/mock/i)
  expect(analysisRequests).toBe(0)

  await page.locator('.citation-chip').first().click()
  await expect(page.locator('#evidence-viewer')).toBeVisible()
  await expect.poll(() => page.locator('#pdf-canvas').evaluate(canvas => (canvas as HTMLCanvasElement).width)).toBeGreaterThan(0)
  await expect(page.locator('#evidence-viewer')).toHaveAttribute('role', 'dialog')
  await page.keyboard.press('Escape')
  await expect(page.locator('#evidence-viewer')).toBeHidden()

  await page.locator('[data-review-action="revise"][data-challenge="provenance-flip"][data-field="mechanism"]').click()
  const editor = page.locator('[data-editor-for="provenance-flip:mechanism"]')
  await editor.locator('.revision-value').fill('Human revision: the witness must causally precede evaluation and report.')
  await editor.locator('.revision-reason').fill('The mock mechanism did not discriminate experience from later evaluation.')
  await editor.locator('.save-review').click()
  await page.locator('#accept-remaining').click()
  await expect(page.locator('#review-resolved')).toHaveText('18')
  await expect(page.locator('#review-progress')).toHaveAttribute('aria-valuenow', '18')
  await expect(page.locator('#manifest-human')).toContainText('18 / 18')
  await expect(page.locator('#export-final')).toBeEnabled()

  const downloadPromise = page.waitForEvent('download')
  await page.locator('#export-final').click()
  const download = await downloadPromise
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const artifact = JSON.parse(await readFile(downloadPath!, 'utf8'))
  expect(artifact.schemaVersion).toBe('mac-evaluation-run/v2')
  expect(artifact.artifactStatus).toBe('adjudicated')
  expect(artifact.paper.authors).toEqual(['Ada Witness', 'Kris Krüg'])
  expect(artifact.paper.year).toBe(2026)
  expect(artifact.reviewEvents.some((event: { reviewerAlias: string }) => event.reviewerAlias === 'Kris Krüg')).toBe(true)
  const revision = artifact.reviewEvents.find((event: { claimId: string; decision: string }) =>
    event.claimId.endsWith(':provenance-flip:mechanism') && event.decision === 'revised'
  )
  expect(revision.humanValue).not.toBe(revision.modelValue)
  await expect(page.locator('#manifest-integrity')).toContainText(new RegExp(artifact.integrityDigest.slice(0, 12), 'i'))

  const reportDownloadPromise = page.waitForEvent('download')
  await page.locator('[data-report="methodsHtml"]').click()
  const reportDownload = await reportDownloadPromise
  const reportPath = await reportDownload.path()
  const report = await readFile(reportPath!, 'utf8')
  expect(report).toContain('Machine said')
  expect(report).toContain('Human called')
  expect(report).not.toMatch(/<script/i)

  await page.locator('#artifact-input').setInputFiles(downloadPath!)
  await expect(page.locator('#imported-artifact')).toBeVisible()
  await expect(page.locator('#imported-artifact')).toContainText('VERIFIED IMPORT')
  await expect(page.locator('#imported-artifact')).toContainText('Witness Theory')
})

test('keeps the inherited Atlas and paper surfaces reachable', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('a[href="/bench"]')).toBeVisible()
  await page.goto('/paper')
  await expect(page.locator('body')).toContainText('A Landscape of Consciousness')
})

test('rejects malformed and scanned PDFs without sending their contents', async ({ page }, testInfo) => {
  const malformedPath = testInfo.outputPath('malformed.pdf')
  const scannedPath = testInfo.outputPath('scanned.pdf')
  await writeFile(malformedPath, Buffer.from('not a pdf'))
  await writeFile(scannedPath, pdfFixture(''))
  let analysisRequests = 0
  page.on('request', request => {
    if (request.url().includes('/api/analyze')) analysisRequests += 1
  })

  await page.goto('/bench')
  await page.locator('#paper-input').setInputFiles(malformedPath)
  await expect(page.locator('#drop-status')).toContainText('SOURCE REJECTED')
  await page.locator('#paper-input').setInputFiles(scannedPath)
  await expect(page.locator('#toast')).toContainText('Scanned PDFs need OCR')
  expect(analysisRequests).toBe(0)
})

test('saves review work locally and reconnects it only to the matching PDF', async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath('checkpoint-witness.pdf')
  await writeFile(pdfPath, pdfFixture(
    'Conscious experience depends on a recurrent witness process that integrates sensory evidence before deliberate report.'
  ))

  await page.goto('/bench')
  await page.locator('#paper-input').setInputFiles(pdfPath)
  await page.locator('#analysis-consent').check()
  await page.locator('#analyze-button').click()
  await expect(page.locator('.challenge-chamber')).toHaveCount(3)

  await page.locator('[data-review-action="revise"][data-challenge="provenance-flip"][data-field="mechanism"]').click()
  const editor = page.locator('[data-editor-for="provenance-flip:mechanism"]')
  await editor.locator('.revision-value').fill('Checkpointed human revision.')
  await editor.locator('.revision-reason').fill('Preserve this human call across reload.')
  await editor.locator('.save-review').click()
  await page.locator('#save-checkpoint').click()
  await expect(page.locator('#toast')).toContainText('CHECKPOINT SAVED LOCALLY')

  await page.reload()
  await expect(page.locator('#checkpoint-list option')).toHaveCount(1)
  await page.locator('#load-checkpoint').click()
  await expect(page.locator('#checkpoint-resume-status')).toContainText('RESELECT THE ORIGINAL PDF')
  await page.locator('#paper-input').setInputFiles(pdfPath)

  await expect(page.locator('.challenge-chamber')).toHaveCount(3)
  await expect(page.locator('[data-challenge-card="provenance-flip"][data-field-card="mechanism"]')).toContainText('Checkpointed human revision.')
  await expect(page.locator('#checkpoint-resume-status')).toContainText('HASH MATCH / REVIEW RESTORED')

  page.once('dialog', dialog => dialog.accept())
  await page.locator('#delete-all-checkpoints').click()
  await expect(page.locator('#checkpoint-list option')).toHaveCount(0)
})

test('runs blind lock, provenance reveal, and portable disagreement files without an account', async ({ page }) => {
  test.setTimeout(60_000)
  const alphaReceipt = new URL('../../fixtures/demo/witness-theory-adjudicated.json', import.meta.url).pathname
  await page.goto('/bench')
  await page.locator('#artifact-input').setInputFiles(alphaReceipt)
  await expect(page.locator('#collaboration-status')).toContainText('CANONICAL RECEIPT READY')

  const packetDownloadPromise = page.waitForEvent('download')
  await page.locator('#export-blind-packet').click()
  const packetPath = await (await packetDownloadPromise).path()
  const packet = JSON.parse(await readFile(packetPath!, 'utf8'))
  expect(packet.schemaVersion).toBe('blind-review-packet/v1')
  expect(JSON.stringify(packet)).not.toContain('Witness Theory')

  const envelopeDownloadPromise = page.waitForEvent('download')
  await page.locator('#export-provenance-envelope').click()
  const envelopePath = await (await envelopeDownloadPromise).path()

  await page.locator('#review-packet-input').setInputFiles(packetPath!)
  await expect(page.locator('#blind-review-form .portable-call')).toHaveCount(15)
  await page.locator('#blind-review-form [data-call="reason"]').evaluateAll(inputs => {
    for (const input of inputs) (input as HTMLInputElement).value = 'Independent blind reason.'
  })
  const contributionDownloadPromise = page.waitForEvent('download')
  await page.locator('#lock-blind-calls').click()
  const contributionPath = await (await contributionDownloadPromise).path()
  const contribution = JSON.parse(await readFile(contributionPath!, 'utf8'))
  expect(contribution.schemaVersion).toBe('review-contribution/v1')

  await page.locator('#provenance-envelope-input').setInputFiles(envelopePath!)
  await expect(page.locator('#provenance-reveal')).toContainText('PROVENANCE REVEALED')
  await expect(page.locator('#revealed-review-form .portable-call')).toHaveCount(15)
  await page.locator('#revealed-review-form [data-call="reason"]').evaluateAll(inputs => {
    for (const input of inputs) (input as HTMLInputElement).value = 'Reason after verified provenance.'
  })
  await page.locator('#revealed-review-form [data-call="judgment"]').first().selectOption('unsupported')
  const deltaDownloadPromise = page.waitForEvent('download')
  await page.locator('#export-revealed-contribution').click()
  const deltaPath = await (await deltaDownloadPromise).path()
  const delta = JSON.parse(await readFile(deltaPath!, 'utf8'))
  expect(delta.provenanceReveal.deltas.some((item: { changed: boolean }) => item.changed)).toBe(true)

  await page.locator('#blind-packet-input').setInputFiles(packetPath!)
  await page.locator('#bundle-contributions-input').setInputFiles(deltaPath!)
  const bundleDownloadPromise = page.waitForEvent('download')
  await page.locator('#merge-contributions').click()
  const bundlePath = await (await bundleDownloadPromise).path()
  const bundle = JSON.parse(await readFile(bundlePath!, 'utf8'))
  expect(bundle.schemaVersion).toBe('review-bundle/v1')
  expect(bundle).not.toHaveProperty('score')
  await expect(page.locator('#disagreement-view')).toContainText('NO AVERAGING')
})

test('exports a frozen preregistration and OSF-ready local package without an external write', async ({ page }) => {
  const alphaReceipt = new URL('../../fixtures/demo/witness-theory-adjudicated.json', import.meta.url).pathname
  await page.goto('/bench')
  await page.locator('#artifact-input').setInputFiles(alphaReceipt)
  await expect(page.locator('#research-status')).toContainText('CANONICAL RECEIPT READY')

  const preregDownloadPromise = page.waitForEvent('download')
  await page.locator('#export-preregistration').click()
  const preregPath = await (await preregDownloadPromise).path()
  const prereg = JSON.parse(await readFile(preregPath!, 'utf8'))
  expect(prereg.schemaVersion).toBe('mac-preregistration/v1')
  expect(prereg.frozenBenchmark.integrityDigest).toMatch(/^[a-f0-9]{64}$/)

  const osfDownloadPromise = page.waitForEvent('download')
  await page.locator('#export-osf-package').click()
  const osfPath = await (await osfDownloadPromise).path()
  const osf = JSON.parse(await readFile(osfPath!, 'utf8'))
  expect(osf.schemaVersion).toBe('osf-ready-package/v1')
  expect(osf.uploadNotice).toContain('No external archive write')
  expect(osf.files.some((file: { name: string }) => file.name === 'ro-crate-metadata.json')).toBe(true)
})

test('supports keyboard completion, screen-reader state, reduced motion, mobile layout, and 200 percent zoom', async ({ page }, testInfo) => {
  const pdfPath = testInfo.outputPath('accessible-witness.pdf')
  await writeFile(pdfPath, pdfFixture(
    'Conscious experience depends on a recurrent witness process that integrates sensory evidence before deliberate report.'
  ))
  await page.setViewportSize({ width: 375, height: 812 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/bench')
  await page.locator('#paper-input').setInputFiles(pdfPath)
  await expect(page.locator('#drop-status')).toHaveText('LOCAL PARSE / COMPLETE')
  await expect(page.locator('#drop-status')).toHaveAttribute('role', 'status')
  await expect(page.locator('#drop-status')).toHaveAttribute('aria-live', 'polite')

  await page.locator('#analysis-consent').focus()
  await page.keyboard.press('Space')
  await expect(page.locator('#analysis-consent')).toBeChecked()
  await expect(page.locator('#analyze-button')).toBeEnabled()
  await page.locator('#analyze-button').press('Enter')
  await expect(page.locator('.challenge-chamber')).toHaveCount(3)
  await page.locator('#accept-remaining').press('Enter')
  await expect(page.locator('#review-resolved')).toHaveText('18')
  await expect(page.locator('.decision-state.accepted').first()).toContainText('accepted')
  await expect(page.locator('#export-final')).toBeEnabled()

  const transitionSeconds = await page.locator('#review-progress').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).transitionDuration)
  )
  expect(transitionSeconds).toBeLessThanOrEqual(0.001)
  const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(mobileOverflow).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  const zoomOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(zoomOverflow).toBeLessThanOrEqual(1)
})
