import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy
} from 'pdfjs-dist'
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { sha256Bytes, sha256Text } from './hash'
import { analysisRequestSchema, type AnalysisRequest } from './schema'

GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const MAX_PDF_BYTES = 20 * 1024 * 1024
const MAX_PAGES = 80
const MAX_CHARACTERS = 350_000

export interface PaperSession {
  file: File
  document: PDFDocumentProxy
  paper: AnalysisRequest['paper']
}

function metadataString(info: Record<string, unknown>, key: string): string | undefined {
  const value = info[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export async function extractPaper(file: File): Promise<PaperSession> {
  if (file.size <= 0) throw new Error('The selected PDF is empty.')
  if (file.size > MAX_PDF_BYTES) throw new Error('The bench accepts PDFs up to 20 MB.')
  if (file.type && file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Select a PDF theory paper.')
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdfSha256 = await sha256Bytes(bytes)
  const document = await getDocument({ data: bytes }).promise
  if (document.numPages > MAX_PAGES) {
    await document.cleanup()
    throw new Error(`The bench accepts up to ${MAX_PAGES} PDF pages.`)
  }

  const pages: AnalysisRequest['paper']['pages'] = []
  for (let pdfPage = 1; pdfPage <= document.numPages; pdfPage += 1) {
    const page = await document.getPage(pdfPage)
    const content = await page.getTextContent()
    const text = content.items
      .map(item => 'str' in item ? item.str : '')
      .join(' ')
      .replace(/\s+\n/g, '\n')
      .trim()
    pages.push({ pdfPage, text })
  }

  const characterCount = pages.reduce((total, page) => total + page.text.length, 0)
  if (characterCount === 0) {
    await document.cleanup()
    throw new Error('No extractable text was found. Scanned PDFs need OCR, which is outside this build.')
  }
  if (characterCount > MAX_CHARACTERS) {
    await document.cleanup()
    throw new Error(`The extracted paper exceeds the ${MAX_CHARACTERS.toLocaleString()} character limit.`)
  }

  const metadata = await document.getMetadata().catch(() => null)
  const info = (metadata?.info ?? {}) as unknown as Record<string, unknown>
  const title = metadataString(info, 'Title') ?? file.name.replace(/\.pdf$/i, '')
  const author = metadataString(info, 'Author')
  const normalizedText = pages.map(page => `[PDF_PAGE_${page.pdfPage}]\n${page.text}`).join('\n\n')

  const paper = analysisRequestSchema.shape.paper.parse({
    fileName: file.name,
    sha256: pdfSha256,
    textSha256: await sha256Text(normalizedText),
    byteSize: file.size,
    pageCount: document.numPages,
    characterCount,
    title,
    ...(author ? { authors: [author] } : {}),
    pages
  })

  return { file, document, paper }
}

export async function renderPdfPage(
  document: PDFDocumentProxy,
  pdfPage: number,
  canvas: HTMLCanvasElement,
  maxWidth: number
): Promise<void> {
  const page = await document.getPage(pdfPage)
  const baseViewport = page.getViewport({ scale: 1 })
  const scale = Math.min(1.6, Math.max(0.45, maxWidth / baseViewport.width))
  const viewport = page.getViewport({ scale })
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas rendering is not available in this browser.')

  canvas.width = Math.floor(viewport.width * pixelRatio)
  canvas.height = Math.floor(viewport.height * pixelRatio)
  canvas.style.width = `${Math.floor(viewport.width)}px`
  canvas.style.height = `${Math.floor(viewport.height)}px`

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0]
  }).promise
}
