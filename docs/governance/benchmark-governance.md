# MAC benchmark governance

Status: proposed governance mechanics for review. This document does not establish a standing MAC office, designate a publication decision owner, or approve any benchmark release.

## Boundary

Kris stewards product mechanics and release sequencing. A human designated by MAC owns publication and retirement decisions for benchmark versions released under MAC's name. Until MAC records that designation, those transitions are blocked.

Challenge records contain the scientific proposal and its integrity-relevant metadata. Approval, recusals, review decisions, dissent, and private deliberation do not belong in benchmark bytes. They remain inspectable in the public proposal issue and release pull request.

## Roles and decision owners

- **Proposer and authors** write the draft, provide evidence, answer review, and keep authorship accurate. Authorship is not approval authority.
- **Challenge steward** is named in the proposal. The steward owns `draft -> provisional` and may withdraw a draft or provisional version to `retired` after recording a reason.
- **Independent reviewer** is not an author, is not recused, and checks the phenomenon, evidence, confounds, demands, and change-my-mind observation. Reviewers may approve the process while recording scientific dissent.
- **MAC-designated publication decision owner (unassigned)** is a human MAC must designate outside the benchmark file. That person alone owns `provisional -> published` and the retirement of a published MAC version. A conflicted decision owner must recuse and MAC must designate a substitute.
- **Product steward** owns repository mechanics and release order, but cannot substitute a product decision for MAC scientific publication approval.

## Lifecycle

| State | Entry and owner | Byte rule | Exit |
| --- | --- | --- | --- |
| `draft` | Every ordinary new version begins here. The proposer edits it under the named challenge steward. | Editable. | The steward may move it to `provisional` after minimum review, or withdraw it to `retired`. |
| `provisional` | The challenge steward records that the evidence and schema are ready for wider review. | Editable, but it cannot return to `draft`. | The designated MAC approver may publish after minimum review, or the steward may withdraw it to `retired`. |
| `published` | The designated MAC approver records the decision outside the bytes after required review and green validation. | Sealed byte-for-byte, including the lifecycle value. | It never changes in place. Correction, replacement, or retirement creates a higher version with `supersedes`. |
| `retired` | A steward may withdraw an editable draft/provisional in place. Retirement of a published version is a new higher-version tombstone owned by the designated MAC approver and linked with `supersedes`. | Terminal and sealed byte-for-byte. | None. A later replacement is another higher version linked with `supersedes`. |

Allowed in-place transitions are `draft -> provisional`, `draft -> retired`, `provisional -> published`, and `provisional -> retired`. Remaining in `draft` or `provisional` while revising is allowed. Backward, skipped, published-in-place, and retired-in-place mutations are rejected by CI.

The published-retirement tombstone is the only new version that may enter the registry directly as `retired`. It must have a higher semantic version and point to an existing `published` or `retired` version of the same challenge. The sealed predecessor remains in the registry unchanged.

## Minimum review

Before `draft -> provisional`:

1. The challenge passes the registry schema and validator.
2. One non-author, non-recused independent reviewer checks the evidence standard and all five demands.
3. The challenge steward records the transition, reviewer, conflicts or recusals, and unresolved dissent in the proposal issue.

Before `provisional -> published`:

1. A second non-author, non-recused independent reviewer completes the same check.
2. Every blocking mechanics finding is resolved; scientific disagreement may remain visible.
3. The designated MAC publication approver records approval in a permalinked GitHub comment, review, or decision record.
4. The release pull request links that record and passes registry validation against its base commit.

Review is a process threshold, not consensus. Neither approval nor publication asserts that a challenge is true, important, or endorsed by every reviewer.

## Evidence and proposal standard

Every proposal must provide:

- a lowercase hyphenated slug, semantic version, public title, phenomenon, adversarial prompt, and rationale;
- explicit assumptions, known confounds, and theory commitments being pressure-tested;
- the five fixed demands in canonical order: explanation, mechanism, novel prediction, falsifier, and measurable witness;
- at least one empirical anchor with a stable DOI or direct source URL;
- public authorship roles, a named challenge steward, and an observation that would change the proposer's mind;
- a public conflict and recusal statement;
- any predecessor link and the reason for correction, replacement, or retirement.

An empirical anchor should be a primary empirical source when one exists. A review, taxonomy, event page, or other contextual source must be labelled as contextual rather than presented as direct empirical support. Reviewers check that the source is retrievable and actually bears on the stated phenomenon or confound; a citation's presence alone is insufficient.

## Conflicts and recusals

Authors, reviewers, stewards, and approvers disclose interests that could reasonably affect the decision, including direct authorship, recent collaboration, employment, funding, or a commercial stake. A conflicted person may contribute evidence or a dissenting view but cannot count toward minimum independent review or approve the affected transition.

The public record states the conflict category and whether the person recused. It must not contain private messages, personal contact details, confidential deliberation, or unnecessary sensitive facts. If even the category cannot be disclosed safely, record only that the person recused and let the designated human handle details outside the public artifact.

## Corrections, replacements, and retirement

Published and retired files are never edited, reformatted, renamed, or removed. Even a typo correction receives a higher semantic version. The new record uses `supersedes` to identify the exact prior challenge ID and version; CI rejects missing, self-referential, cross-challenge, and non-forward links.

- A correction or replacement begins as a higher-version `draft` and follows normal review.
- Retirement of a published version creates a higher-version `retired` tombstone with `supersedes` and an external retirement decision.
- Benchmarks already bound to an older challenge digest continue to resolve that exact version.
- The proposal and release records explain the change and link both versions. No score or silent overwrite substitutes for that history.

## Decision record outside benchmark bytes

The proposal issue and release pull request record:

- challenge ID, version, lifecycle transition, and integrity digest;
- named steward, reviewers, approver, recusals, and authorship changes;
- review permalinks, decision date, unresolved dissent, and the exact release commit;
- predecessor, replacement, or retirement links when applicable.

The release file may contain only fields allowed by the public schema. Do not add an approval flag, consensus claim, reviewer vote count, or private discussion to make the bytes appear authoritative.

## Dissent

Dissent is evidence. Keep materially different interpretations attributed and separate in the proposal or linked review. Do not average reviews, require unanimity, convert disagreement into a score, or rewrite minority views into synthetic consensus. The publication approver decides only whether the documented standard was met.

## Release procedure

1. Open the challenge proposal; ordinary proposals start as `draft`.
2. Name the steward, authors, anchors, conflicts, and predecessor if any.
3. Obtain the required independent reviews and preserve dissent.
4. Change lifecycle only through an allowed transition and run registry validation against the base commit.
5. For MAC publication or published retirement, link the designated approver's public decision outside the benchmark bytes.
6. Merge through normal repository review. Git history, the immutable file, its digest, and the external decision link form the release receipt.
