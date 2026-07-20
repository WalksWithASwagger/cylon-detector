# Agentic scripts

These Python standard-library tools enforce the repository's bounded delivery contract. They are read-only with respect to GitHub and external services.

## `issue_lint.py`

Checks required sections, an entirely unchecked acceptance checklist, executable verification, repository-relative ownership paths, supported readiness labels, and stop-label conflicts. Its JSON result returns the actual ownership path rules for later diff enforcement.

```bash
python3 scripts/agentic/issue_lint.py \
  --issue-file path/to/issue.md \
  --labels agent:ready
```

Exit `0` means the body supports the claimed ready state. Exit `2` prints actionable JSON errors. It does not apply a label.

## `status_report.py`

Classifies open issues as ready, invalid-ready, in progress, blocked, needs human, or other, and non-draft agent PRs as review-ready. Every `agent:ready` issue body is linted; malformed claims land in `invalid_ready` with errors. The live mode queries only `WalksWithASwagger/cylon-detector`, even when the checkout retains another upstream remote.

```bash
python3 scripts/agentic/status_report.py
```

Offline mode requires both fixture files and makes no GitHub call:

```bash
python3 scripts/agentic/status_report.py \
  --issues-file test/agentic/fixtures/issues.json \
  --prs-file test/agentic/fixtures/prs.json
```

Issue JSON uses GitHub's `number`, `title`, `body`, `state`, `url`, and `labels` fields. PR JSON uses `number`, `title`, `body`, `headRefName`, `isDraft`, `url`, `labels`, and `statusCheckRollup`.

## `auto_merge_gate.py`

Evaluates canonical issue and PR snapshots. It fails unless both snapshots identify the configured repository, the issue is open and ready, the PR is open and targets `master`, its exact head SHA is recorded, a strict closing line binds it to that issue, the diff is typed and internally consistent, every file is owned, no protected path is present, and `review-ready`, `agent:auto-merge`, and all required checks pass.

```bash
python3 scripts/agentic/auto_merge_gate.py \
  --issue-json path/to/issue.json \
  --pr-json path/to/pr.json
```

The issue JSON supplies `repository`, `number`, `body`, `labels`, and `state`. The PR JSON supplies `repository`, `number`, `body`, `state`, `baseRefName`, `headRefName`, `headRefOid`, `isDraft`, `labels`, `linkedIssueNumber`, `additions`, `deletions`, `changedFiles`, `files`, and `statusCheckRollup`. See `valid-issue.json` and `review-ready-pr.json` under `test/agentic/fixtures/`.

Normalize GitHub's REST pull-files `filename` field to `path` and retain its `status`. Only `added`, `modified`, and `removed` are auto-mergeable. Renames, copies, missing or unknown status, and `previousFilename` fail closed for human review. Required checks retain their union shape: CheckRun uses `name`, `status`, and `conclusion`; StatusContext uses `context` and `state`. CheckRun passes only at `COMPLETED` with a passing conclusion, and StatusContext only at `SUCCESS`.

Ownership rules have precise semantics: plain paths match exact files; a trailing `/` owns a directory recursively; `*` and `?` stay inside one path segment; and `**` crosses directories. Duplicate files, mismatched `changedFiles`, unowned files, control-plane changes, environment files, credentials, or protected scientific and release surfaces all fail closed. Public `.env.schema` files are protected boundary contracts, not described as secret material.

Exit `0` means native auto-merge is eligible to be enabled. The tool never enables or invokes a merge. Exit `2` is the fail-closed state.

## Tests

```bash
python3 -m unittest discover -s test/agentic -p 'test_*.py'
npm run test:agentic
```

The fixtures cover a real child issue body, every required issue failure, offline lane classification, and the auto-merge refusal states. The suite uses no network, GitHub authentication, vendor access, or secrets.
