# Research notes for the Cylon Detector roadmap

Research refreshed July 20, 2026. This is the evidence base for the product roadmap, not a literature review pretending to be finished.

## What the field says we should build

### A map is not a test

Robert Lawrence Kuhn's landscape organizes hundreds of explanations across a physicalist-to-idealist spectrum. It is valuable because it makes the size and structure of the problem visible. It does not adjudicate which theory survives contact with evidence. The Cylon Detector should sit beside the Atlas as the pressure-testing layer, not claim to replace the map.

Source: [Kuhn, “A Landscape of Consciousness”](https://pubmed.ncbi.nlm.nih.gov/38281544/)

### Adversarial collaboration needs separation of powers

The Cogitate Consortium's adversarial test of Integrated Information Theory and Global Neuronal Workspace Theory used preregistered predictions, independent data collection, multiple sites and modalities, an optimization set, and a larger replication set. The paper also preserved disagreement by letting the consortium and the theory proponents interpret the same record separately.

Product consequence: separate extraction, evidence checking, human judgment, proponent response, and independent review. Preserve all voices. Do not turn disagreement into a fake consensus number.

Sources: [Nature paper](https://www.nature.com/articles/s41586-025-08888-1), [Cogitate Consortium](https://www.arc-cogitate.com/), [preregistration](https://osf.io/92tbg/)

### A consciousness test is not one magic behaviour

Bayne and colleagues argue that current consciousness tests have serious limits, especially outside healthy adult humans. They emphasize multidimensional classification and validation against populations where consciousness status is comparatively well grounded.

Product consequence: record converging evidence by type. Keep behavioural, architectural, neural, intervention, and report evidence distinct. “Passed the Turing test” is not a consciousness finding.

Source: [Bayne et al., “Tests for consciousness in humans and beyond”](https://sussex.figshare.com/articles/journal_contribution/Tests_for_consciousness_in_humans_and_beyond/25442152)

### Indicators support credences, not a binary oracle

Butlin and colleagues derive indicator properties from scientific theories of consciousness and argue that computational implementations can be investigated empirically. Their framing warns against both under-attributing and over-attributing consciousness.

Product consequence: later AI-system modules should expose theory-derived indicators and counterevidence. They should never emit “Cylon detected” as a scientific fact.

Sources: [2025 indicator framework](https://eprints.lse.ac.uk/130322/), [2023 report](https://arxiv.org/abs/2308.08708)

### Responsible research needs a stop button

Work on potentially conscious AI systems can create moral uncertainty and public confusion. Butlin and Lappas recommend explicit policies for research, deployment, and public communication.

Product consequence: add an ethics gate before tests involving live AI systems, deception, human participants, or potentially welfare-relevant interventions. Record the approved protocol, consent basis, stop conditions, and publication boundary.

Source: [Butlin and Lappas, “Principles for Responsible AI Consciousness Research”](https://arxiv.org/abs/2501.07290)

### Theory-light does not mean theory-free

Work comparing animal and machine consciousness tests shows why clusters of indicators and double dissociations are useful, but not definitive. Every test inherits assumptions about what counts as evidence.

Product consequence: every filter should declare its assumptions, target theory commitments, known confounds, and the observation that would actually change a reviewer's mind.

Source: [Dung, “Tests of Animal Consciousness are Tests of Machine Consciousness”](https://link.springer.com/article/10.1007/s10670-023-00753-9)

## What adjacent evaluation infrastructure teaches us

### Replayable evaluation logs

The UK AI Security Institute's Inspect framework makes tasks, datasets, solvers, scorers, transcripts, and logs explicit. Its modularity is useful even though the Cylon Detector should reject scalar scoring as its primary output.

Product consequence: make every run replayable from a versioned benchmark, source digest, prompt digest, model manifest, and human decision log.

Source: [Inspect AI](https://inspect.aisi.org.uk/)

### Research objects, not lonely JSON files

RO-Crate packages research artifacts and context in JSON-LD. W3C PROV models entities, activities, and agents so a reader can see who did what with which source.

Product consequence: the current JSON receipt can grow into a portable research object containing the paper digest, benchmark, model draft, citations, reviewer calls, report, contributors, and software version.

Sources: [RO-Crate 1.2](https://www.researchobject.org/ro-crate/specification/1.2/introduction.html), [W3C PROV Primer](https://www.w3.org/TR/prov-primer/)

### Preregistration should be a first-class object

OSF registrations create permanent timestamped versions of research plans and can receive DOIs. Its API exposes projects, files, registrations, and metadata.

Product consequence: let a crew freeze predictions and analysis rules before seeing results, then export the frozen plan or connect it to OSF with explicit authorization.

Sources: [OSF registrations](https://help.osf.io/article/330-welcome-to-registrations), [OSF API](https://developer.osf.io/)

### Provenance has standards

C2PA Content Credentials can bind signed provenance claims to an asset and preserve its origin and edit history. The standard makes facts tamper-evident but does not decide whether the source is trustworthy.

Product consequence: a future Provenance Flip study can read Content Credentials as one source of origin claims, then deliberately separate cryptographic verification from the participant's conscious response to the reveal.

Sources: [C2PA specifications](https://spec.c2pa.org/specifications/), [C2PA explainer](https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html)

### Documentation needs its own receipts

Model Cards, Datasheets for Datasets, and CRediT make model limitations, dataset decisions, and contributor roles explicit.

Product consequence: publish a Benchmark Card, a Paper Card, and a contributor ledger with each public report.

Sources: [Model Cards](https://research.google/pubs/model-cards-for-model-reporting/), [Datasheets for Datasets](https://www.microsoft.com/en-us/research/publication/datasheets-for-datasets/), [CRediT](https://credit.niso.org/)

### Accessible status is part of scientific usability

WCAG 2.2 requires visible keyboard focus and programmatically available status messages. This matters in a dense review console where colour cannot be the only carrier of state.

Product consequence: preserve text labels for every verdict and citation state, provide strong focus indicators, announce progress and errors, respect reduced motion, and test the entire adjudication loop from the keyboard.

Source: [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## Data-boundary receipt for the current alpha

The server analysis route uses OpenAI's Responses API with `store: false`. OpenAI states that API data is not used to train models by default unless an organization opts in. Standard abuse-monitoring logs may retain customer content for up to 30 days unless a project has approved Zero Data Retention or Modified Abuse Monitoring controls.

Product consequence: say exactly that in the interface. “We do not intentionally persist it” is too vague to earn trust.

Source: [OpenAI API data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)

## The line through all of it

The machine can draft the attack. It cannot appoint itself judge. The bench earns trust by showing the source, the draft, the human call, the disagreement, and the receipt.
