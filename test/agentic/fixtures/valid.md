**Repository:** WalksWithASwagger/cylon-detector
**Labels:** enhancement
**Linear:** Not configured
**Epic:** #2
**Wave:** 1 — parallel preparation
**Readiness:** Manual dispatch until the contract issue lands and this body passes its linter.

---

# Build a deterministic field-release QA evidence harness

## Context

The local test suite proves core behaviour, but the field release needs a repeatable evidence packet tied to an exact commit. Build a harness that exercises the stranger journey and produces inspectable privacy, accessibility, offline-report, and local-resume evidence without deploying anything.

Sources:

- [Field-release workplan](https://github.com/WalksWithASwagger/cylon-detector/blob/master/docs/roadmap/field-release-workplan.md)
- [Release handoff](https://github.com/WalksWithASwagger/cylon-detector/blob/master/docs/operations/release-handoff.md)

## Dependencies

- Parent: #2
- Depends on: #3
- Can run in parallel with the receipt, collaboration, governance, and invite-tooling lanes

## Ownership Surface

- `test/e2e/field-release.spec.ts`
- `scripts/validate-field-evidence.ts`
- `docs/operations/field-qa.md`
- `playwright.config.ts`
- `package.json`

## Acceptance Criteria

- [ ] One command runs malformed PDF, valid PDF, citation verification, human revision or rejection, checkpoint resume, receipt import, and local-data deletion flows.
- [ ] The harness records the exact commit, viewport, analysis channel, benchmark digest, and artifact digest in a machine-readable manifest.
- [ ] Network assertions fail if paper text reaches analytics, feedback, or storage endpoints.
- [ ] Static reports are opened with JavaScript disabled and verified for required content.
- [ ] Keyboard, screen-reader semantics, reduced motion, mobile layout, and 200 percent zoom checks produce explicit pass or failure evidence.
- [ ] Generated evidence is ignored unless a maintainer deliberately promotes a reviewed fixture.

## Tests/Evals

- The harness itself fails when a forbidden network request is injected.
- The harness fails when the source PDF reselected for resume has a different digest.

## Verification

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run test:e2e
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm run verify
```

## Agent Instructions

- Branch from the current `master` and keep the diff scoped to this issue.
- Do not revert or absorb another agent's work; rebase or coordinate when ownership surfaces overlap.
- Record assumptions and evidence in the PR.
- Run every listed verification command before opening a PR.
- Open a focused PR only after verification passes.
- Keep the harness deterministic and mock-only.
- Use synthetic local PDFs; never commit copyrighted paper contents.

## Human Checkpoints

- A human must visually inspect the promoted desktop and mobile evidence.
- Running this harness against a deployed preview requires separate preview approval.

## Out of Scope

- Deploying Vercel.
- Enabling live OpenAI analysis.
- Creating a hosted screenshot or paper archive.

## Linear

- Team: Not configured
- Project: Not configured
- Issue: Not configured
