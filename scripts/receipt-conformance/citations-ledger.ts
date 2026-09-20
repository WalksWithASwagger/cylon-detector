import { stableStringify } from '../../src/bench/artifact'
import { verdictSchema } from '../../src/bench/schema'
import type { EvaluationRunV2 } from '../../src/bench/v2/artifact'
import { demandKeyV2Schema } from '../../src/bench/v2/contracts'
import { ReceiptConformanceError } from './errors'
import { terminalValue } from './input'

export function assertCitationEvidence(run: EvaluationRunV2): void {
  const verified = new Map<string, EvaluationRunV2['verifiedCitations'][number]>()
  for (const citation of run.verifiedCitations) {
    if (verified.has(citation.id)) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Verified citation ID ${terminalValue(citation.id)} is duplicated.`
      )
    }
    verified.set(citation.id, citation)
  }

  const assertDraftCitation = (
    draft: EvaluationRunV2['aiDraft']['theory']['centralClaims'][number]['citations'][number],
    expectedField: string
  ) => {
    const citation = verified.get(draft.id)
    const safeId = terminalValue(draft.id)
    if (!citation) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} is missing from verifiedCitations.`
      )
    }
    if (citation.verification !== 'exact' && citation.verification !== 'normalized') {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} has failed verification status ${citation.verification}.`
      )
    }
    if (
      draft.quote !== citation.quote ||
      draft.pdfPage !== citation.pdfPage ||
      draft.printedPageLabel !== citation.printedPageLabel ||
      draft.supportsField !== citation.supportsField ||
      draft.supportsField !== expectedField
    ) {
      throw new ReceiptConformanceError(
        'CITATION_EVIDENCE',
        `Referenced citation ${safeId} does not match the verified record and field coordinate ${terminalValue(expectedField)}.`
      )
    }
  }

  for (const claim of run.aiDraft.theory.centralClaims) {
    for (const citation of claim.citations) assertDraftCitation(citation, 'theory.centralClaims')
  }
  for (const challenge of run.aiDraft.challenges) {
    for (const demand of demandKeyV2Schema.options) {
      for (const citation of challenge[demand].citations) {
        assertDraftCitation(citation, `challenges.${challenge.challengeId}.${demand}`)
      }
    }
  }

  for (const row of run.claimLedger) {
    for (const source of row.sourceQuotes) {
      const citation = verified.get(source.citationId)
      const safeId = terminalValue(source.citationId)
      if (!citation) {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim Ledger source ${safeId} is missing from verifiedCitations.`
        )
      }
      if (citation.verification !== 'exact' && citation.verification !== 'normalized') {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim Ledger source ${safeId} has failed verification status ${citation.verification}.`
        )
      }
      if (
        source.verification !== citation.verification ||
        source.quote !== citation.quote ||
        source.pdfPage !== citation.pdfPage ||
        source.printedPageLabel !== citation.printedPageLabel
      ) {
        throw new ReceiptConformanceError(
          'CITATION_EVIDENCE',
          `Claim ${terminalValue(row.claimId)} source ${safeId} does not match its verified citation record.`
        )
      }
    }
  }
}

function eventFinalCall(event: EvaluationRunV2['reviewEvents'][number]) {
  return {
    decision: event.decision,
    ...(event.decision === 'accepted' ? { value: event.modelValue } : {}),
    ...(event.decision === 'revised' && event.humanValue ? { value: event.humanValue } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    eventId: event.eventId
  }
}

export function assertClaimLedgerBindings(run: EvaluationRunV2): void {
  const challengeVersions = new Map(run.benchmark.challenges.map(challenge => [challenge.id, challenge.version]))
  const rows = new Map<string, EvaluationRunV2['claimLedger'][number]>()
  for (const row of run.claimLedger) {
    if (rows.has(row.claimId)) {
      throw new ReceiptConformanceError('LEDGER_BINDING', `Claim ID ${terminalValue(row.claimId)} is duplicated.`)
    }
    rows.set(row.claimId, row)
  }

  const expectedClaimIds = new Set<string>()
  const permittedEventClaimIds = new Set<string>()
  for (const challenge of run.aiDraft.challenges) {
    const challengeVersion = challengeVersions.get(challenge.challengeId)
    if (!challengeVersion) {
      throw new ReceiptConformanceError(
        'LEDGER_BINDING',
        `AI draft challenge ${terminalValue(challenge.challengeId)} is absent from the benchmark snapshot.`
      )
    }
    permittedEventClaimIds.add(`verdict:${run.runId}:${challenge.challengeId}`)
    for (const demand of demandKeyV2Schema.options) {
      const expectedClaimId = `claim:${run.runId}:${challenge.challengeId}:${demand}`
      expectedClaimIds.add(expectedClaimId)
      permittedEventClaimIds.add(expectedClaimId)
      const row = rows.get(expectedClaimId)
      if (!row) {
        throw new ReceiptConformanceError('LEDGER_BINDING', `Expected claim ${terminalValue(expectedClaimId)} is missing.`)
      }
      if (
        row.challenge.id !== challenge.challengeId ||
        row.challenge.version !== challengeVersion ||
        row.demand !== demand ||
        row.modelDraft !== challenge[demand].text
      ) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} contradicts its benchmark or AI draft coordinate.`
        )
      }

      const draftCitationIds = challenge[demand].citations.map(citation => citation.id)
      const ledgerCitationIds = row.sourceQuotes.map(citation => citation.citationId)
      if (stableStringify(draftCitationIds) !== stableStringify(ledgerCitationIds)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} does not retain its complete ordered citation list.`
        )
      }

      const matchingEvents = run.reviewEvents.filter(event => event.claimId === expectedClaimId)
      const matchingEventIds = matchingEvents.map(event => event.eventId)
      if (stableStringify(row.humanEventIds) !== stableStringify(matchingEventIds)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} does not retain its complete ordered review-event history.`
        )
      }
      if (matchingEvents.some(event => event.modelValue !== row.modelDraft)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} review event does not retain the sealed model draft.`
        )
      }
      const latestEvent = matchingEvents.at(-1)
      const expectedFinalCall = latestEvent ? eventFinalCall(latestEvent) : undefined
      if (stableStringify(row.finalCall) !== stableStringify(expectedFinalCall)) {
        throw new ReceiptConformanceError(
          'LEDGER_BINDING',
          `Claim ${terminalValue(expectedClaimId)} final call does not match its latest review event.`
        )
      }
    }
  }

  if (rows.size !== expectedClaimIds.size || [...rows.keys()].some(claimId => !expectedClaimIds.has(claimId))) {
    throw new ReceiptConformanceError('LEDGER_BINDING', 'Claim Ledger contains an unexpected or contradictory claim coordinate.')
  }
  const unexpectedEvent = run.reviewEvents.find(event => !permittedEventClaimIds.has(event.claimId))
  if (unexpectedEvent) {
    throw new ReceiptConformanceError(
      'LEDGER_BINDING',
      `Review event ${terminalValue(unexpectedEvent.eventId)} targets unexpected claim ${terminalValue(unexpectedEvent.claimId)}.`
    )
  }
}

export function assertStressFractureBindings(run: EvaluationRunV2): void {
  const fractures = new Map<string, EvaluationRunV2['stressFractureMap'][number]>()
  for (const fracture of run.stressFractureMap) {
    if (fractures.has(fracture.challengeId)) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture challenge ${terminalValue(fracture.challengeId)} is duplicated.`
      )
    }
    fractures.set(fracture.challengeId, fracture)
  }

  for (const challenge of run.aiDraft.challenges) {
    const fracture = fractures.get(challenge.challengeId)
    const safeChallengeId = terminalValue(challenge.challengeId)
    if (!fracture) {
      throw new ReceiptConformanceError('VERDICT_BINDING', `Stress Fracture ${safeChallengeId} is missing.`)
    }
    if (fracture.modelVerdict !== challenge.proposedVerdict) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} model verdict contradicts the sealed AI draft.`
      )
    }

    const verdictClaimId = `verdict:${run.runId}:${challenge.challengeId}`
    const verdictEvents = run.reviewEvents.filter(event => event.claimId === verdictClaimId)
    if (verdictEvents.some(event => event.modelValue !== challenge.proposedVerdict)) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} verdict stream does not retain the sealed model verdict.`
      )
    }
    const latestEvent = verdictEvents.at(-1)
    if (!latestEvent) {
      if (fracture.humanDecision || fracture.humanVerdict || fracture.rationale) {
        throw new ReceiptConformanceError(
          'VERDICT_BINDING',
          `Stress Fracture ${safeChallengeId} has a human call without a verdict event stream.`
        )
      }
      continue
    }

    const humanVerdict = latestEvent.decision === 'accepted'
      ? verdictSchema.safeParse(latestEvent.modelValue)
      : latestEvent.decision === 'revised'
        ? verdictSchema.safeParse(latestEvent.humanValue)
        : verdictSchema.safeParse('insufficient_evidence')
    if (!humanVerdict.success) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} latest verdict event has an invalid categorical value.`
      )
    }
    if (
      fracture.humanDecision !== latestEvent.decision ||
      fracture.humanVerdict !== humanVerdict.data ||
      fracture.rationale !== latestEvent.reason
    ) {
      throw new ReceiptConformanceError(
        'VERDICT_BINDING',
        `Stress Fracture ${safeChallengeId} does not match the latest event in its complete ordered verdict stream.`
      )
    }
  }

  if (fractures.size !== run.aiDraft.challenges.length) {
    throw new ReceiptConformanceError('VERDICT_BINDING', 'Stress Fracture Map contains an unexpected challenge coordinate.')
  }
}
