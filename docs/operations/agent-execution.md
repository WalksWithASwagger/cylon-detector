# Agent execution runbook

Use this runbook after a maintainer has approved a scoped issue for execution. The machine-readable authority is [`agentic/contract.json`](../../agentic/contract.json); this document explains the human operating sequence.

## Local toolchain preflight

Run this read-only check before claiming a lane or querying GitHub. It compares the interactive Node major to `.nvmrc` and `package.json`, compares standalone Varlock to the project pin, and reports GitHub CLI ambiguity. It never edits git remotes, `gh` defaults, environment files, or GitHub state.

```bash
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec -- tsx scripts/validate-local-toolchain.ts
```

Exact operator commands when a check fails:

```bash
# Node 22 — matches .nvmrc 22.12.0 and package.json engines.node 22.x
PATH=/opt/homebrew/opt/node@22/bin:$PATH node --version

# Project-local Varlock 1.11.0, not a standalone/global binary
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec -- varlock load --agent --show-all
PATH=/opt/homebrew/opt/node@22/bin:$PATH npm exec -- varlock scan --staged

# Explicit repository — do not rely on gh's default remote
gh -R WalksWithASwagger/cylon-detector issue list
gh -R WalksWithASwagger/cylon-detector api --paginate repos/WalksWithASwagger/cylon-detector/pulls/<number>/files
```

If Node is 26, standalone Varlock is 1.10.0, or `remote.upstream.gh-resolved=base`, use the matching command above in that shell. Do not run `git config`, `gh repo set-default`, or a global Varlock upgrade as part of this preflight.

## Before claiming a lane

1. Run the local toolchain preflight and keep Node 22 plus project-local Varlock on PATH.
2. Refresh open issues and PRs with `scripts/agentic/status_report.py` using `gh -R WalksWithASwagger/cylon-detector` when the default remote is ambiguous.
3. Confirm the issue has no `needs-human`, `blocked`, or `in-progress` label.
4. Save the issue body to a local file and run `issue_lint.py` with the intended `agent:ready` label.
5. Confirm dependencies and the complete ownership surface.
6. Confirm no active lane owns an overlapping path.
7. Start from current `master` in an isolated `codex/<issue>-<slug>` branch or worktree.

The scripts do not apply labels. A maintainer reviews the contract result and makes the GitHub state change.

## While executing

- Work on one issue per lane.
- Touch only paths named in the issue.
- Preserve unrelated dirty work and coordinate before resolving overlap.
- Run the narrowest test first, then every verification command in the issue.
- Record assumptions, deviations, and evidence in the PR.
- Do not broaden coding authority into an external or protected action.

Move the lane to `blocked` when a dependency prevents progress. Use `needs-human` when a decision, approval, protected-path review, or external action is required. `in-progress` excludes another autonomous claimant.

## Pull-request handoff

A lane handoff contains:

- a focused non-draft PR from `codex/*`;
- `Closes #<issue>` in the PR body;
- changed paths within the declared ownership surface;
- exact verification commands and results;
- remaining risks, deviations, and human gates;
- no secrets, generated caches, debug files, or unrelated changes.

Review happens before `review-ready`. Automatic merge is a later, explicit opt-in: a maintainer adds `agent:auto-merge`, captures canonical issue and PR JSON from the same repository state, runs `auto_merge_gate.py`, and only then may enable GitHub's native auto-merge. A failing gate means do not merge.

The issue snapshot contains `repository`, `number`, `body`, `labels`, and `state`. The PR snapshot contains `repository`, `number`, `body`, `state`, `baseRefName`, `headRefName`, `headRefOid`, `isDraft`, `labels`, `linkedIssueNumber`, `additions`, `deletions`, `changedFiles`, `files`, and `statusCheckRollup`. The gate requires `master`, an open issue and PR, a full head commit SHA, typed diff counts, and exact agreement between `changedFiles` and the unique file list.

GitHub's PR GraphQL view does not expose file change status consistently, so capture the same-head REST pull-files response and normalize each `filename` to `path` while retaining `status`. Auto-merge accepts only `added`, `modified`, and `removed`; `renamed`, `copied`, unknown, or missing status and any `previousFilename` require human review. A removed file is checked under its deleted path. This prevents a protected origin from escaping review through a safe-looking rename.

```bash
gh -R WalksWithASwagger/cylon-detector api --paginate repos/WalksWithASwagger/cylon-detector/pulls/<number>/files
```

For required checks, retain the canonical GitHub union shape. CheckRun records use `name`, `status`, and `conclusion` and pass only when status is `COMPLETED`. StatusContext records use `context` and `state` and pass only at `SUCCESS`. Do not flatten the two shapes or discard status.

The PR body uses a standalone GitHub closing-keyword line such as `Closes #4`. Negated or descriptive prose is not a closing reference. Every file must match the issue Ownership Surface: exact files match exactly, trailing `/` owns descendants, `*` and `?` stay within one segment, and `**` crosses directories.

## Immediate stop conditions

Stop without guessing when:

- requirements conflict or materially change the architecture;
- a protected path appears unexpectedly;
- the change crosses the contract file or line limit;
- tests expose an unrelated repository failure;
- live credentials, production state, spending, or a vendor account would be required;
- the work would deploy, publish, license, archive externally, or collect research data;
- a force push, branch-protection change, permission change, label creation, or high-risk merge is requested without explicit approval.

Local code and documentation can remain complete while an external gate is stopped. Report those as separate states rather than treating one as authority for the other.

## Offline rehearsal

The complete contract can be rehearsed without GitHub or secrets:

```bash
python3 scripts/agentic/issue_lint.py \
  --issue-file test/agentic/fixtures/valid.md \
  --labels agent:ready
python3 scripts/agentic/status_report.py \
  --issues-file test/agentic/fixtures/issues.json \
  --prs-file test/agentic/fixtures/prs.json
python3 scripts/agentic/auto_merge_gate.py \
  --issue-json test/agentic/fixtures/valid-issue.json \
  --pr-json test/agentic/fixtures/review-ready-pr.json
```
