import { describe, expect, it } from 'vitest'
import { verifyCitation } from '@/bench/citationVerifier'

const pages = [
  {
    pdfPage: 1,
    text: 'Conscious experience is both differentiated and integrated. The mechanism must account for both.'
  },
  {
    pdfPage: 2,
    text: 'A cause–effect repertoire specifies the constraints imposed by a mechanism in a state.'
  }
]

describe('verifyCitation', () => {
  it('marks a verbatim quote on the cited page as exact', () => {
    const result = verifyCitation(pages, {
      pdfPage: 1,
      quote: 'Conscious experience is both differentiated and integrated.'
    })

    expect(result.verification).toBe('exact')
  })

  it('normalizes Unicode punctuation and line-break hyphenation', () => {
    const result = verifyCitation(
      [{ pdfPage: 7, text: 'The cause–effect reper-\ntoire constrains the system.' }],
      { pdfPage: 7, quote: 'The cause-effect repertoire constrains the system.' }
    )

    expect(result.verification).toBe('normalized')
  })

  it('does not rescue a quote from a different page', () => {
    const result = verifyCitation(pages, {
      pdfPage: 1,
      quote: 'A cause-effect repertoire specifies the constraints imposed by a mechanism in a state.'
    })

    expect(result.verification).toBe('not_found')
  })
})
