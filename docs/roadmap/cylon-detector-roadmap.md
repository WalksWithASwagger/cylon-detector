# Cylon Detector product roadmap

Status: long-range product direction. The local skunkworks beta now implements the major instrument surfaces described below. Current release execution lives in [the field-release workplan](field-release-workplan.md).

## The true line

The detector does not tell you what is conscious. It finds where a theory goes soft.

That distinction is the whole product. The world does not need another chatbot wearing a lab coat or a leaderboard that turns metaphysics into 87.3 percent science. It needs a public instrument that can put a theory under pressure, show its work, preserve disagreement, and hand the next human a receipt.

## Product contract

Every feature must strengthen at least one of these promises:

1. No consciousness score.
2. No uncited scientific claim.
3. No AI verdict disguised as a human conclusion.
4. No silent mutation of a benchmark, prompt, source, or review.
5. No consensus theatre. Disagreement stays visible.
6. No experimental claim without a measurable witness and a falsifier.
7. No public artifact without provenance, contributors, limits, and a privacy receipt.

## What the original alpha got right

The current alpha is a real end-to-end instrument, not a Figma promise:

- It accepts a local PDF, extracts text, and hashes the source in the browser.
- It keeps the paper local until the reviewer gives explicit consent.
- It runs three versioned adversarial filters against five scientific demands.
- It treats the model output as a draft and requires eighteen human calls.
- It checks that quoted evidence exists on the cited page.
- It preserves the machine draft when a human revises or rejects it.
- It exports a versioned JSON artifact with a SHA-256 integrity receipt.
- It never emits a consciousness score.

The visual language is already its own thing: part field instrument, part punk zine, part Cylon control room. Keep that. The next move is more legibility, more evidence, and more ways for other humans to disagree productively.

## Roadmap at a glance

| Horizon | Outcome | The killer feature |
|---|---|---|
| Alpha hardening | A Thursday demo nobody can accidentally break | Run manifest and complete evidence receipt |
| Public bench | A paper can be challenged, reviewed, and shared | Claim Ledger with source-page proof |
| Collaborative lab | Independent humans can disagree without losing the plot | Blind Chamber and three-voice report |
| Research-grade protocol | Predictions are frozen before results are seen | Preregistered optimization and replication runs |
| Cylon Detector proper | AI systems can be examined without pretending certainty | Theory-derived indicator bundles with ethics gates |

## 1. Interface roadmap

### P0: Make the alpha bulletproof

#### Clear the open-source release gate

The inherited Atlas repository says MIT in its README but does not include a tracked license file. Public code is not automatically open-source code. Before calling the combined fork an open-source release, get the upstream author's license confirmation, preserve attribution, and mark the license boundary between inherited Atlas material and original MAC Bench work.

Success means another lab can legally fork, run, inspect, and extend the bench without guessing which rights came with which files.

#### Run manifest

Keep the compact strip now visible beneath the phase rail. Expand it only when the data exists:

- benchmark version and digest
- paper digest and page count
- local or server analysis channel
- provider, model, prompt version, and `store` setting
- reviewer identity and review state
- source commit and artifact digest

Success means a lab participant can answer “what exactly am I looking at?” without opening DevTools or trusting us.

#### Evidence viewer that earns the word evidence

Add previous and next citation controls, keyboard shortcuts, copied-quote feedback, page thumbnails, and a visible distinction between exact match, normalized match, and not found. Keep the warning: quote matching proves the words exist, not that the interpretation is good.

#### Save and resume

Persist an encrypted or explicitly local draft in IndexedDB. Show the last saved time. Let the reviewer download a checkpoint at any point. Never silently sync paper text to a cloud service.

#### Accessibility pass

Finish the full WCAG-oriented keyboard loop. Announce parsing, analysis, citation failure, and export status to assistive technology. Add skip links. Test 200 percent zoom. Keep reduced motion. Never encode a verdict by colour alone.

### P1: Build the Claim Ledger

The current five-column attack is visually strong but cognitively dense. Give every extracted commitment its own ledger row:

`claim → source quote → page → filter → scientific demand → model draft → human call → reason`

The ledger becomes the navigation spine. A reviewer can sort by broken citation, unresolved field, challenge, claim, or human revision. Clicking any cell opens the original page and the immutable history.

Success means every conclusion can be traced backward to a source and forward to the experiment it implies.

### P1: Machine said / human called

Add a split diff for every revised field. The machine draft stays on the left. The human revision and reason stay on the right. Rejection is a first-class result, not an empty box.

This is where the project becomes educational. People can see judgment happening instead of merely seeing the polished end state.

### P1: The Blind Chamber

Hide theory name, author, institution, citation prestige, and model identity during the first review. Reveal provenance only after the reviewer has made an initial call. Record the delta.

This is the Provenance Flip turned inward on the bench itself. If a famous theory suddenly feels more convincing when the label appears, that change belongs in the evidence trail.

Success means the artifact can distinguish the blind call, the revealed call, and the reviewer's reason for changing or holding position.

### P2: Three-voice view

Borrow the best move from adversarial collaboration:

1. Bench record: sources, frozen predictions, and observations.
2. Proponent voice: the theory advocate's interpretation and rebuttal.
3. Independent voice: a reviewer who did not build the theory or the test.

Do not merge these into one synthetic paragraph. Let the tension live.

### P2: Comparison without a leaderboard

Allow two papers, theory versions, models, or review rounds to be viewed side by side. Compare categorical outcomes, evidence coverage, predicted experiments, and reviewer disagreements. Never total them into one winner number.

## 2. Output roadmap

### P0: Run Receipt

Keep JSON as the canonical portable artifact. Extend it with:

- benchmark and prompt digests
- source and software commit
- analysis manifest and token usage
- every citation verification result
- immutable model drafts
- every human decision, reason, and timestamp
- final categorical verdicts
- generated experiment cards
- privacy and consent record
- artifact digest and optional signatures

The receipt should validate offline. If one byte changes, the seal should break loudly.

### P1: Claim Ledger export

Export the ledger as JSON and CSV for analysis, plus a readable HTML table for humans. Every row gets a stable ID so comments and corrections can target the exact claim rather than “that thing on page 17.”

### P1: Stress Fracture Map

Generate a matrix of adversarial filters by scientific demands:

- survives
- strained
- evades
- breaks
- insufficient evidence

The map is categorical and clickable. Its job is to show where the theory needs work, not crown a champion.

### P1: Witness Protocol cards

Turn every accepted novel prediction into a compact protocol:

- intervention
- independent variable
- dependent measure
- population or system
- contrast condition
- expected directional signature
- observation that would falsify the mechanism
- source commitments that justify the prediction

This is the handoff from consciousness jibba jabba to an experiment somebody could actually run.

### P1: Provenance Delta

For Blind Chamber and Provenance Flip runs, export the exact change between blind, revealed, and deliberately mislabelled conditions. Keep judgment, confidence, response time, phenomenological description, and reason for change as separate fields.

### P2: Research Object package

Package the run as RO-Crate JSON-LD with W3C PROV relationships between source paper, benchmark, model activity, reviewer activity, generated reports, and contributors. Add C2PA Content Credentials when the report is published as a signed media artifact.

The result should be able to travel between a lab, a repository, and an archive without shedding its history.

## 3. Report roadmap

One run should generate different windows onto the same canonical receipt. Do not make separate truth silos.

### P1: Two-minute Lab Note

A one-page field report for the MAC room:

- what was tested
- the three categorical calls
- the sharpest unsupported claim
- the best experiment worth running
- the biggest disagreement
- who made the final call
- link and digest for the full receipt

Tone: direct, vivid, no throat-clearing. “Here is where the theory went soft.”

### P1: Methods and Evidence Report

A publication-grade HTML and PDF report:

1. paper and theory card
2. benchmark card and version history
3. analysis manifest
4. filter-by-filter findings
5. claim ledger with page citations
6. human revisions and reasons
7. experiment protocols
8. limits, conflicts, and unresolved disagreement
9. contributor roles
10. integrity and reproducibility receipt

The report should print beautifully, remain readable without JavaScript, and link every claim back to the local or permitted source.

### P1: Peer-review packet

Export an anonymized packet for blind review and a keyed packet for the coordinator. Include a review form, stable claim IDs, and a clean way to return signed decisions without exposing the paper to a new cloud service.

### P2: Three-voice report

Publish the neutral bench record first, then the proponent response, then the independent review. Add a dissent appendix rather than sanding disagreement into mush.

### P2: Preregistration and deviations report

Show what was predicted before the run, what changed, who authorized the change, and why. A deviation is not automatically bad. A hidden deviation is.

### P2: Public field report

Create a readable, shareable story for the curious public. Use plain language, visual evidence, and the human stakes of the phenomenon. Link to the full methods report instead of pretending the short version contains every caveat.

## 4. Functionality roadmap

### P1: Versioned challenge registry

Let the community propose adversarial filters in the exact MAC format:

- name
- phenomenon overview
- why a theory must explain it
- adversarial formulation
- assumptions and confounds
- source literature
- proposed scientific demands

Submissions open as drafts. Maintainers review them. Published filters are immutable by version. Improvements create a new version with a changelog.

### P1: Multi-reviewer disagreement

Support independent reviews, reviewer roles, declared conflicts, blind rounds, and inter-reviewer comparison. Show where humans agree and where they do not. Do not collapse disagreement into an average score.

### P1: Multi-paper theory bundles

Most theories do not live in one PDF. Allow a versioned bundle of foundational paper, current formulation, empirical papers, critiques, and author responses. Each extracted commitment keeps its source identity.

### P1: Paper and theory version diff

Run IIT 3.0 against IIT 4.0, or an original paper against a later clarification. Show which commitments changed, which evasions disappeared, and which new predictions appeared.

### P1: Private analysis options

Add a local-model adapter for labs that cannot send paper text to a provider. Keep the same schema, prompt digest, and human review path so local and hosted runs remain comparable without pretending different models are identical.

### P2: Preregistered run mode

Freeze the benchmark, predictions, analysis plan, exclusions, and interpretation rules before opening the result. Support export to OSF and later linkage to a permanent registration. External writes require explicit human authorization.

### P2: Optimization and sealed replication

Separate a small sandbox set used to refine a filter from a sealed replication set used to test it. Record every change between the two. This is how the bench grows teeth without training itself on the answer key.

### P2: Proponent rebuttal workflow

Invite theory authors or designated advocates to challenge extraction errors, missing citations, unfair falsifiers, and benchmark assumptions. Preserve the original run and attach the response as a new signed layer.

### P2: Replay and drift detection

Re-run a frozen paper and benchmark against a new model, prompt, or software version. Diff extraction, evidence coverage, and proposed verdicts. This makes model drift visible instead of quietly rewriting scientific history.

### P2: DOI, Zotero, and Crossref intake

Use a DOI or citation file to prefill metadata and retrieve an openly accessible paper when rights permit. Never treat metadata retrieval as permission to process or redistribute the full text.

### P3: Theory-derived AI indicator bundles

Add explicit indicator packs derived from competing consciousness theories. Keep architecture evidence, behavioural evidence, intervention evidence, self-report, and counterevidence in separate lanes. Report calibrated uncertainty and theory dependence.

The output is an evidence profile, not “human,” “Cylon,” or “conscious.” The joke can name the instrument. It cannot substitute for the conclusion.

### P3: Live Provenance Flip study builder

Build blind, reveal, and deliberately mislabelled trials for art, music, and other media. Capture the participant's immediate felt response before asking for evaluation or explanation. Support C2PA verification as one provenance input.

This feature crosses into human-subject research. It needs a real protocol, consent language, debriefing, data governance, and ethics review before collecting a single participant response.

### P3: Ethics and welfare gate

Before a live AI-system or human-participant protocol can run, require:

- research purpose and theory basis
- consent or authorization basis
- deception and debrief plan
- welfare-relevant intervention assessment
- stop conditions
- data retention and publication plan
- named human owner

The detector needs a big red stop button. Responsible science is part of the instrument, not paperwork taped on afterward.

## Build order

The alpha hardening, Claim Ledger, printable reports, Blind Chamber, portable collaboration, research packaging, and gated indicator machinery now exist in the local beta. The next work is to land and field-prove them, not quietly add more surface area. Follow the [field-release workplan](field-release-workplan.md).

The implemented arc is:

`paper → pressure test → source proof → human call → provenance reveal → changed or unchanged call → portable report`

That is already more interesting than a generic consciousness benchmark. It turns your Provenance Flip into both a filter inside the detector and a test of the detector's own humans.

## What we deliberately do not build yet

- a composite consciousness score
- automatic pass or fail gates
- a public leaderboard of theories or AI systems
- unsupervised web scraping of copyrighted papers
- silent paper upload
- anonymous community verdicts with no evidence trail
- a human-subject experiment before ethics and consent are real
- a claim that a signed artifact is therefore true

## Definition of beautiful

Beautiful here does not mean polished until it looks like every other AI product. It means the form tells the truth about the function.

- Black space creates focus.
- Gold marks the benchmark and its demands.
- Cyan marks extracted evidence and human revision.
- Signal red marks broken evidence and unresolved danger.
- Pale green marks a sealed human-reviewed receipt.
- Typography makes the attack feel alive.
- Plain language makes the limits impossible to miss.

The final feeling should be: somebody built a serious scientific instrument, invited the punks into the lab, and left every panel open so we can see the wires.

## Research basis

The feature priorities above are grounded in [Kuhn's landscape taxonomy](https://pubmed.ncbi.nlm.nih.gov/38281544/), the [Cogitate adversarial collaboration](https://www.nature.com/articles/s41586-025-08888-1), [tests for consciousness across populations and systems](https://sussex.figshare.com/articles/journal_contribution/Tests_for_consciousness_in_humans_and_beyond/25442152), [theory-derived AI consciousness indicators](https://eprints.lse.ac.uk/130322/), [responsible consciousness research principles](https://arxiv.org/abs/2501.07290), [Inspect AI's replayable evaluation architecture](https://inspect.aisi.org.uk/), [RO-Crate](https://www.researchobject.org/ro-crate/specification/1.2/introduction.html), [W3C PROV](https://www.w3.org/TR/prov-primer/), [OSF registrations](https://help.osf.io/article/330-welcome-to-registrations), [C2PA Content Credentials](https://spec.c2pa.org/specifications/), and [WCAG 2.2](https://www.w3.org/TR/WCAG22/).
