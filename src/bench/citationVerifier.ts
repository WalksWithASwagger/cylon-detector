import type { CitationDraft, PaperPage, VerifiedCitation } from './schema'

type CitationInput = Pick<CitationDraft, 'pdfPage' | 'quote'> & Partial<CitationDraft>

const ligatures: Record<string, string> = {
  'ﬀ': 'ff',
  'ﬁ': 'fi',
  'ﬂ': 'fl',
  'ﬃ': 'ffi',
  'ﬄ': 'ffl'
}

export function normalizeCitationText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[ﬀﬁﬂﬃﬄ]/g, character => ligatures[character])
    .replace(/([\p{L}])-\s*\n\s*([\p{L}])/gu, '$1$2')
    .replace(/[‐‑‒–—―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export function verifyCitation(
  pages: PaperPage[],
  citation: CitationInput,
  verifiedAt = new Date().toISOString()
): VerifiedCitation {
  const page = pages.find(candidate => candidate.pdfPage === citation.pdfPage)
  let verification: VerifiedCitation['verification'] = 'not_found'

  if (page?.text.includes(citation.quote)) {
    verification = 'exact'
  } else if (page) {
    const normalizedPage = normalizeCitationText(page.text)
    const normalizedQuote = normalizeCitationText(citation.quote)
    if (normalizedQuote.length > 0 && normalizedPage.includes(normalizedQuote)) {
      verification = 'normalized'
    }
  }

  return {
    id: citation.id ?? `citation-${citation.pdfPage}-${citation.quote.slice(0, 24)}`,
    pdfPage: citation.pdfPage,
    quote: citation.quote,
    supportsField: citation.supportsField ?? 'unknown',
    ...(citation.printedPageLabel ? { printedPageLabel: citation.printedPageLabel } : {}),
    ...(citation.locationHint ? { locationHint: citation.locationHint } : {}),
    verification,
    verifiedAt
  }
}

export function verifyCitations(pages: PaperPage[], citations: CitationDraft[]): VerifiedCitation[] {
  const timestamp = new Date().toISOString()
  return citations.map(citation => verifyCitation(pages, citation, timestamp))
}
