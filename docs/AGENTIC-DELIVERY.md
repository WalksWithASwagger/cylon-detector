# Agentic delivery contract

This repository uses issues and pull requests as bounded execution receipts. The contract in [`agentic/contract.json`](../agentic/contract.json) tells agents what a ready issue must contain, which paths require human review, and which actions are never inherited from a coding assignment.

The machinery is deliberately advisory and fail-closed. It reads issue or PR JSON, classifies work, and returns a verdict. It does not create labels, change repository permissions, enable auto-merge, deploy software, provision vendors, publish benchmarks, alter licensing, or authorize research.

## Canonical flow

```text
intake candidate
  → scoped GitHub issue
  → issue lints with agent:ready
  → maintainer applies agent:ready
  → one isolated issue lane
  → linked codex/* pull request
  → review and passing required checks
  → maintainer applies review-ready
  → optional maintainer applies agent:auto-merge
  → auto_merge_gate.py passes
  → native GitHub auto-merge may be enabled
```

Inbox, email, chat, and meeting requests remain intake candidates until a human approves issue creation. `agent:ready` is an execution claim, not an idea-stage label.

## Ready issue contract

A ready issue has all of these sections:

- `Context`
- `Dependencies`
- `Ownership Surface`
- `Acceptance Criteria`
- `Tests/Evals`
- `Verification`
- `Agent Instructions`
- `Human Checkpoints`
- `Out of Scope`

Acceptance criteria must be an unchecked Markdown checklist; one completed `[x]` item makes the ready claim invalid even if other items remain unchecked. Verification must contain executable commands. Ownership must name repository-relative paths and remain within the path limit in the contract. `agent:ready` cannot coexist with `in-progress`, `blocked`, or `needs-human`.

Ownership rules are intentionally small and exact:

- a path without wildcards or a trailing slash owns that exact file only;
- a path ending in `/` owns that directory and its descendants;
- `*` and `?` match inside one path segment and never cross `/`;
- `**` can cross directory boundaries.

The auto-merge gate refuses any changed file not matched by one of those rules.

Lint an issue body before applying the label:

```bash
python3 scripts/agentic/issue_lint.py \
  --issue-file test/agentic/fixtures/valid.md \
  --labels agent:ready
```

The positive fixture is the body of child issue #4 as it existed when the contract was introduced. Negative fixtures make each refusal actionable.

## Lane states

The status report uses stop-state precedence:

1. `needs-human`
2. `blocked`
3. `in-progress`
4. `agent:ready`

A non-draft `codex/*` PR with `review-ready` is classified as review-ready. Draft PRs remain in progress. An issue carrying `agent:ready` is linted from its current body and labels; a false claim is placed in `invalid_ready` with actionable errors, never in `ready`. One lane owns one issue or PR and only the paths declared by that work item.

Refresh live state:

```bash
python3 scripts/agentic/status_report.py
```

Run deterministically without GitHub access:

```bash
python3 scripts/agentic/status_report.py \
  --issues-file test/agentic/fixtures/issues.json \
  --prs-file test/agentic/fixtures/prs.json
```

## Pull-request and auto-merge gates

A PR can pass the auto-merge evaluator only when all conditions are true:

- a canonical issue snapshot supplies the repository, open state, number, body, and labels;
- a canonical PR snapshot supplies repository, PR number, open state, `master` base, head branch and commit SHA, draft state, labels, checks, diff counts, and a status-bearing file list;
- the linked issue body passes the issue linter with its snapshot labels and `agent:ready`;
- `linkedIssueNumber` equals the canonical issue number;
- a standalone `Closes #<number>`, `Fixes #<number>`, or `Resolves #<number>` line binds the PR only to that issue; prose such as `Do not close #4` is never accepted;
- the head branch begins with `codex/`;
- the PR is non-draft and has `review-ready`;
- every required check in the contract has a passing conclusion;
- `additions`, `deletions`, and `changedFiles` are typed non-negative integers;
- `changedFiles` exactly equals the unique `files` entries, and the diff remains within the file and line boundaries;
- each file is normalized from GitHub's pull-files response to `{path, status}`; only `added`, `modified`, and `removed` can auto-merge, while renames and copies require human review;
- every changed path is inside the issue's declared Ownership Surface;
- no protected path or stop label is present;
- `agent:auto-merge` is explicitly present.

Required checks use GitHub's actual union shapes. A CheckRun requires `name`, `status: COMPLETED`, and a passing `conclusion`. A StatusContext requires `context` and `state: SUCCESS`. Missing, pending, mixed-shape, or duplicate check identities fail closed.

Evaluate a captured PR without mutating GitHub:

```bash
python3 scripts/agentic/auto_merge_gate.py \
  --issue-json test/agentic/fixtures/valid-issue.json \
  --pr-json test/agentic/fixtures/review-ready-pr.json
```

A passing verdict means only that a maintainer may enable native GitHub auto-merge. It is not a merge command. Branch protection and GitHub checks remain authoritative.

## Stop rules and protected authority

Stop the lane and classify it appropriately when:

- another lane owns an overlapping file;
- a dependency is unresolved;
- acceptance criteria require a materially different architecture;
- verification exposes an unrelated failure;
- the issue exceeds its ownership or change boundary;
- a requested action crosses a human gate.

Protected paths are listed in the contract. Changes to the agentic control plane, CI, secret boundaries, deployment configuration, licensing, benchmark releases, and research indicators always refuse automatic merge. Actual `.env` variants, Vercel environment files, package credentials, keys, and obvious credential or token files are treated as secret-bearing. `.env.schema` is a public configuration contract, not a secret; it remains protected because changing the secret boundary requires human review.

Coding authority never includes deployment, vendor provisioning or spend, production secrets, license requests or grants, MAC benchmark publication, OSF writes, human-subject data collection, deception, repository permissions, branch protection, or label creation. These actions require their own explicit human approvals even when adjacent code is complete.

## Verification

The standard-library tests run inside the existing `npm test` CI step and require no GitHub, vendor, network, or secret access:

```bash
npm run test:agentic
npm test
npm run verify
```
