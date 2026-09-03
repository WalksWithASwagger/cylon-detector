# Portable collaboration rehearsal

This tool rehearsal checks the mechanics of exchanging Cylon Detector review files between machines. It uses fixed, fictional reviewers and a deterministic synthetic receipt. It is tooling QA, not human-subject research, a scientific result, or permission to recruit reviewers or collect responses.

## Boundary

The rehearsal is partial blinding, not anonymity. The blind packet withholds the paper title, authors, institutions, DOI, theory name, model and prompt identity, PDF, source quotations, page locations, and raw paper/text digests. Theory language, benchmark metadata, UUIDs, timestamps, commitments, and derived digests can still identify or correlate a source. A dictionary attack may recover predictable source material.

The provenance envelope intentionally reveals source and model provenance after the first-call file has been locked. Reviewer aliases are labels, not verified identities. Response times and free-text reasons can identify real people, so this synthetic kit is not a safe template for collecting live participant data.

SHA-256 integrity digests detect changed bytes when the expected digest is already trusted. They are unkeyed and can be recomputed by anyone who changes an artifact. They do not authenticate identity, authorship, timing, consent, scientific correctness, or an unbroken history.

The standalone conformance validator is the hardened boundary in this rehearsal. It recursively verifies the portable files and their cross-file bindings. The browser/native collaboration validators are unchanged and do not inherit these additional checks. The public browser page may also request external font assets; the offline claim applies only to this standalone validator and portable-file workflow.

## Run the rehearsal

Use Node 22 from the repository root:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run validate:collaboration
```

The validator reads fixed local filenames, rejects missing, unexpected, oversized, non-regular, or symlinked inputs, and performs no writes. Network access is disabled while validation runs. No API client, analytics, account, hosted storage, server processing, or secret is used.

It checks:

- raw blind JSON for prohibited provenance fields and revealed values before schema parsing;
- packet, envelope, contribution, lock, and bundle integrity digests;
- internally consistent run, packet, source, receipt-label, benchmark-label, claim, and evidence bindings;
- byte-identical first calls before and after provenance reveal;
- exact one-to-one second calls and independently derived provenance deltas;
- unique fictional contributor IDs and aliases in deterministic order;
- two conflicting categorical calls preserved as separate attributed records;
- the absence of score, average, ranking, winner, leaderboard, or synthetic-consensus fields;
- exact three-voice report bytes with neutral bench, proponent, and reviewer sections.

To demonstrate portability, copy only the nine files listed by `PORTABLE_COLLABORATION_FILES` in `fixtures/collaboration/synthetic-collaboration.ts` to another local directory and pass that directory to the validator script. The committed-fixture reproducibility test binds these exact repository fixtures to the canonical synthetic conformance receipt. A copied standalone kit proves only its internal cross-file consistency; without that receipt it cannot establish that a receipt or benchmark digest is canonical. Regenerate the committed fixtures locally with:

```sh
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run generate:collaboration-fixtures
```

## Prohibited uses

Do not use this rehearsal to recruit people, collect real judgments, response times, or free text, deliberately mislabel provenance, run deception, create accounts, host review files, claim authenticated signatures, average dissent, or publish empirical findings. Any live rehearsal requires separate human coordination, privacy, consent, retention, welfare, and research-ethics approval. Deliberate provenance mislabelling remains disabled.
