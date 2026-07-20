#!/usr/bin/env python3
"""Fail-closed evaluator for explicit native GitHub auto-merge opt-in."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any

from issue_lint import lint_issue, load_contract, normalize_labels


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT = ROOT / "agentic" / "contract.json"
CLOSING_LINE = re.compile(
    r"^\s*(?:[-*]\s+)?(?:close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved)"
    r"\s+#([1-9]\d*)\s*[.!]?\s*$",
    re.IGNORECASE | re.MULTILINE,
)


def nonnegative_int(value: Any) -> bool:
    return type(value) is int and value >= 0


def positive_int(value: Any) -> bool:
    return type(value) is int and value > 0


def linked_issue_numbers(body: str) -> set[int]:
    """Accept only a standalone GitHub closing-keyword line."""
    return {int(number) for number in CLOSING_LINE.findall(body)}


def glob_regex(pattern: str) -> re.Pattern[str]:
    """Compile repository globs where * excludes slash and ** includes slash."""
    pieces: list[str] = ["^"]
    index = 0
    while index < len(pattern):
        char = pattern[index]
        if char == "*":
            if index + 1 < len(pattern) and pattern[index + 1] == "*":
                index += 2
                if index < len(pattern) and pattern[index] == "/":
                    pieces.append("(?:.*/)?")
                    index += 1
                else:
                    pieces.append(".*")
                continue
            pieces.append("[^/]*")
        elif char == "?":
            pieces.append("[^/]")
        else:
            pieces.append(re.escape(char))
        index += 1
    pieces.append("$")
    return re.compile("".join(pieces))


def path_matches_rule(path: str, rule: str) -> bool:
    """Match exact files, slash-terminated directories, or * / ** / ? globs."""
    if rule.endswith("/"):
        directory = rule.rstrip("/")
        return path == directory or path.startswith(directory + "/")
    if not any(token in rule for token in ("*", "?")):
        return path == rule
    return bool(glob_regex(rule).fullmatch(path))


def issue_snapshot_errors(issue: Any, repository: str) -> list[str]:
    if not isinstance(issue, dict):
        return ["Issue snapshot must be a JSON object."]
    errors: list[str] = []
    if issue.get("repository") != repository:
        errors.append(f"Issue repository must be `{repository}`.")
    if not positive_int(issue.get("number")):
        errors.append("Issue number must be a positive integer.")
    if not isinstance(issue.get("body"), str) or not issue["body"].strip():
        errors.append("Issue body must be a non-empty string.")
    if not isinstance(issue.get("labels"), list):
        errors.append("Issue labels must be a JSON list from the canonical issue snapshot.")
    if issue.get("state") != "OPEN":
        errors.append("Issue snapshot must describe an OPEN issue.")
    return errors


def pr_snapshot_errors(pr: Any, contract: dict[str, Any]) -> list[str]:
    if not isinstance(pr, dict):
        return ["PR snapshot must be a JSON object."]
    errors: list[str] = []
    repository = contract["repository"]
    if pr.get("repository") != repository:
        errors.append(f"PR repository must be `{repository}`.")
    if not positive_int(pr.get("number")):
        errors.append("PR number must be a positive integer.")
    if not isinstance(pr.get("body"), str):
        errors.append("PR body must be a string.")
    if pr.get("state") != "OPEN":
        errors.append("PR snapshot must describe an OPEN pull request.")
    if pr.get("baseRefName") != "master":
        errors.append("PR baseRefName must be `master`.")
    if not isinstance(pr.get("headRefName"), str) or not pr["headRefName"]:
        errors.append("PR headRefName must be a non-empty string.")
    if not isinstance(pr.get("headRefOid"), str) or not re.fullmatch(
        r"[0-9a-fA-F]{40}", pr.get("headRefOid", "")
    ):
        errors.append("PR headRefOid must be a 40-character Git commit SHA.")
    if type(pr.get("isDraft")) is not bool:
        errors.append("PR isDraft must be a boolean.")
    if not isinstance(pr.get("labels"), list):
        errors.append("PR labels must be a JSON list from the canonical PR snapshot.")
    if not positive_int(pr.get("linkedIssueNumber")):
        errors.append("PR linkedIssueNumber must be a positive integer.")
    for field in ("additions", "deletions", "changedFiles"):
        if not nonnegative_int(pr.get(field)):
            errors.append(f"PR {field} must be a non-negative integer.")
    files = pr.get("files")
    if not isinstance(files, list):
        errors.append("PR files must be a JSON list from the canonical PR snapshot.")
    else:
        allowed_statuses = set(contract["auto_merge"]["mergeable_file_statuses"])
        for index, file in enumerate(files):
            if (
                not isinstance(file, dict)
                or not isinstance(file.get("path"), str)
                or not file["path"].strip()
            ):
                errors.append(f"PR files[{index}].path must be a non-empty string.")
            if not isinstance(file, dict):
                continue
            status = file.get("status")
            if status not in allowed_statuses:
                errors.append(
                    f"PR files[{index}].status `{status}` is not auto-mergeable; "
                    "only added, modified, and removed are supported."
                )
            if "previousFilename" in file:
                errors.append(
                    f"PR files[{index}] contains previousFilename; renamed and copied files require human review."
                )
    status_checks = pr.get("statusCheckRollup")
    if not isinstance(status_checks, list):
        errors.append("PR statusCheckRollup must be a JSON list.")
    else:
        identities: set[str] = set()
        for index, check in enumerate(status_checks):
            if not isinstance(check, dict):
                errors.append(f"PR statusCheckRollup[{index}] must be a JSON object.")
                continue
            has_name = isinstance(check.get("name"), str) and bool(check["name"])
            has_context = isinstance(check.get("context"), str) and bool(check["context"])
            if has_name == has_context:
                errors.append(
                    f"PR statusCheckRollup[{index}] must be exactly one CheckRun or StatusContext shape."
                )
                continue
            identity = check["name"] if has_name else check["context"]
            if identity in identities:
                errors.append(f"PR status check identity is duplicated: {identity}")
            identities.add(identity)
            if has_name:
                if not isinstance(check.get("status"), str):
                    errors.append(
                        f"PR CheckRun `{identity}` must include a string status."
                    )
                if "conclusion" not in check or not (
                    check["conclusion"] is None
                    or isinstance(check["conclusion"], str)
                ):
                    errors.append(
                        f"PR CheckRun `{identity}` must include a string or null conclusion."
                    )
                if "state" in check:
                    errors.append(
                        f"PR CheckRun `{identity}` cannot contain StatusContext state."
                    )
            else:
                if not isinstance(check.get("state"), str):
                    errors.append(
                        f"PR StatusContext `{identity}` must include a string state."
                    )
                if "status" in check or "conclusion" in check:
                    errors.append(
                        f"PR StatusContext `{identity}` cannot contain CheckRun status or conclusion."
                    )
    return errors


def changed_paths(pr: dict[str, Any]) -> list[str]:
    files = pr.get("files")
    if not isinstance(files, list):
        return []
    return [
        file["path"]
        for file in files
        if isinstance(file, dict)
        and isinstance(file.get("path"), str)
        and file["path"].strip()
    ]


def protected_matches(paths: list[str], contract: dict[str, Any]) -> list[dict[str, str]]:
    matches: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for rule in contract["protected_paths"]:
        if not rule.get("deny_auto_merge", False):
            continue
        for path in paths:
            excluded = any(
                path_matches_rule(path, exclusion)
                for exclusion in rule.get("exclude", [])
            )
            if excluded or not path_matches_rule(path, rule["pattern"]):
                continue
            identity = (path, rule["gate"])
            if identity in seen:
                continue
            seen.add(identity)
            matches.append(
                {"path": path, "pattern": rule["pattern"], "gate": rule["gate"]}
            )
    return matches


def required_checks_pass(pr: dict[str, Any], contract: dict[str, Any]) -> tuple[bool, list[str]]:
    observed: dict[str, list[bool]] = {}
    checks = pr.get("statusCheckRollup")
    if not isinstance(checks, list):
        return False, list(contract["verification"]["required_pr_checks"])
    for check in checks:
        if not isinstance(check, dict):
            continue
        if isinstance(check.get("name"), str):
            name = check["name"]
            passed = (
                check.get("status") == "COMPLETED"
                and check.get("conclusion")
                in set(contract["verification"]["passing_conclusions"])
            )
        elif isinstance(check.get("context"), str):
            name = check["context"]
            passed = check.get("state") in set(
                contract["verification"]["passing_context_states"]
            )
        else:
            continue
        observed.setdefault(name, []).append(passed)
    failures = [
        name
        for name in contract["verification"]["required_pr_checks"]
        if len(observed.get(name, [])) != 1 or not observed[name][0]
    ]
    return not failures, failures


def evaluate_auto_merge(
    issue: dict[str, Any], pr: dict[str, Any], contract: dict[str, Any]
) -> dict[str, Any]:
    repository = contract["repository"]
    issue_errors = issue_snapshot_errors(issue, repository)
    pr_errors = pr_snapshot_errors(pr, contract)
    issue_body = issue.get("body") if isinstance(issue, dict) else ""
    issue_body = issue_body if isinstance(issue_body, str) else ""
    raw_issue_labels = issue.get("labels", []) if isinstance(issue, dict) else []
    issue_labels = normalize_labels(raw_issue_labels if isinstance(raw_issue_labels, list) else [])
    raw_pr_labels = pr.get("labels", []) if isinstance(pr, dict) else []
    labels = set(normalize_labels(raw_pr_labels if isinstance(raw_pr_labels, list) else []))
    label_config = contract["labels"]
    issue_quality = lint_issue(issue_body, issue_labels, contract)

    pr_body = pr.get("body") if isinstance(pr.get("body"), str) else ""
    linked = linked_issue_numbers(pr_body)
    issue_number = issue.get("number")
    expected_issue = pr.get("linkedIssueNumber")
    checks_pass, failed_checks = required_checks_pass(pr, contract)
    paths = changed_paths(pr)
    unique_paths = len(paths) == len(set(paths))
    declared_count = pr.get("changedFiles")
    count_matches = nonnegative_int(declared_count) and declared_count == len(paths)
    additions = pr.get("additions")
    deletions = pr.get("deletions")
    typed_lines = nonnegative_int(additions) and nonnegative_int(deletions)
    changed_lines = additions + deletions if typed_lines else None
    within_limits = (
        count_matches
        and typed_lines
        and declared_count <= contract["limits"]["max_changed_files"]
        and changed_lines <= contract["limits"]["max_changed_lines"]
    )
    ownership = issue_quality.get("ownership_paths", [])
    unowned = [
        path
        for path in paths
        if not any(path_matches_rule(path, rule) for rule in ownership)
    ]
    protected = protected_matches(paths, contract)
    stop_labels = labels & {label_config["blocked"], label_config["needs_human"]}

    checks = {
        "canonical_issue_snapshot": not issue_errors,
        "canonical_pr_snapshot": not pr_errors,
        "has_auto_merge_label": label_config["auto_merge"] in labels,
        "has_review_ready_label": label_config["review_ready"] in labels,
        "no_stop_labels": not stop_labels,
        "not_draft": type(pr.get("isDraft")) is bool and not pr["isDraft"],
        "base_is_master": pr.get("baseRefName") == "master",
        "branch_is_agentic": isinstance(pr.get("headRefName"), str)
        and pr["headRefName"].startswith(contract["branch_prefix"]),
        "linked_issue_matches": positive_int(issue_number)
        and expected_issue == issue_number
        and linked == {issue_number},
        "linked_issue_is_ready": issue_quality["ok"],
        "required_checks_pass": checks_pass,
        "diff_count_matches_files": count_matches,
        "diff_paths_are_unique": unique_paths,
        "within_change_limits": within_limits,
        "files_within_ownership": not unowned and bool(paths),
        "no_protected_paths": not protected,
    }

    reasons = [f"Issue snapshot: {error}" for error in issue_errors]
    reasons.extend(f"PR snapshot: {error}" for error in pr_errors)
    if not checks["has_auto_merge_label"]:
        reasons.append("Explicit `agent:auto-merge` opt-in is absent.")
    if not checks["has_review_ready_label"]:
        reasons.append("PR must have `review-ready` after human or delegated review.")
    if stop_labels:
        reasons.append("PR has stop labels: " + ", ".join(sorted(stop_labels)))
    if not checks["not_draft"]:
        reasons.append("PR is still a draft or isDraft is not canonical JSON boolean data.")
    if not checks["base_is_master"]:
        reasons.append("PR must target `master`.")
    if not checks["branch_is_agentic"]:
        reasons.append(f"PR branch must start with `{contract['branch_prefix']}`.")
    if not checks["linked_issue_matches"]:
        reasons.append(
            "PR linkedIssueNumber and its standalone closing-keyword line must bind only to the canonical issue number."
        )
    if not checks["linked_issue_is_ready"]:
        reasons.append("Canonical linked issue does not lint with `agent:ready`.")
        reasons.extend(f"Issue lint: {error}" for error in issue_quality["errors"])
    if not checks_pass:
        reasons.append("Missing or failing required checks: " + ", ".join(failed_checks))
    if not count_matches:
        reasons.append("PR changedFiles must equal the number of canonical files entries.")
    if not unique_paths:
        reasons.append("PR files must contain unique paths.")
    if not within_limits:
        reasons.append(
            "PR diff must use typed non-negative counts and remain within "
            f"{contract['limits']['max_changed_files']} files and "
            f"{contract['limits']['max_changed_lines']} changed lines."
        )
    if unowned:
        reasons.append("PR contains paths outside the issue Ownership Surface: " + ", ".join(unowned))
    if not paths:
        reasons.append("PR snapshot must contain at least one changed file.")
    for match in protected:
        reasons.append(
            f"Auto-merge denied for protected path `{match['path']}` ({match['gate']})."
        )

    ok = all(checks.values())
    return {
        "ok": ok,
        "verdict": "enable-native-auto-merge" if ok else "do-not-merge",
        "checks": checks,
        "reasons": reasons,
        "issue_snapshot_errors": issue_errors,
        "pr_snapshot_errors": pr_errors,
        "issue_quality": issue_quality,
        "failed_required_checks": failed_checks,
        "protected_paths": protected,
        "unowned_paths": unowned,
        "changed_files": declared_count if nonnegative_int(declared_count) else None,
        "changed_lines": changed_lines,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue-json", type=Path, required=True)
    parser.add_argument("--pr-json", type=Path, required=True)
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    args = parser.parse_args()

    result = evaluate_auto_merge(
        json.loads(args.issue_json.read_text(encoding="utf-8")),
        json.loads(args.pr_json.read_text(encoding="utf-8")),
        load_contract(args.contract),
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
