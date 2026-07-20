#!/usr/bin/env python3
"""Classify live or fixture GitHub work into bounded agentic lanes."""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path
from typing import Any

from issue_lint import lint_issue


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT = ROOT / "agentic" / "contract.json"


def label_names(item: dict[str, Any]) -> set[str]:
    labels: set[str] = set()
    for label in item.get("labels", []):
        name = label.get("name") if isinstance(label, dict) else label
        if isinstance(name, str):
            labels.add(name)
    return labels


def lane_item(item: dict[str, Any], kind: str) -> dict[str, Any]:
    return {
        "kind": kind,
        "number": item.get("number"),
        "title": item.get("title", ""),
        "url": item.get("url"),
        "labels": sorted(label_names(item)),
    }


def build_report(
    issues: list[dict[str, Any]],
    prs: list[dict[str, Any]],
    *,
    source: str,
    contract: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if contract is None:
        contract = json.loads(DEFAULT_CONTRACT.read_text(encoding="utf-8"))
    labels = contract["labels"]
    lanes: dict[str, list[dict[str, Any]]] = {
        "ready": [],
        "in_progress": [],
        "blocked": [],
        "needs_human": [],
        "review_ready": [],
        "invalid_ready": [],
        "other": [],
    }

    for issue in issues:
        issue_labels = label_names(issue)
        item = lane_item(issue, "issue")
        if labels["needs_human"] in issue_labels:
            lanes["needs_human"].append(item)
        elif labels["blocked"] in issue_labels:
            lanes["blocked"].append(item)
        elif labels["in_progress"] in issue_labels:
            lanes["in_progress"].append(item)
        elif labels["ready"] in issue_labels:
            body = issue.get("body") if isinstance(issue.get("body"), str) else ""
            quality = lint_issue(body, list(issue_labels), contract)
            if quality["ok"]:
                lanes["ready"].append(item)
            else:
                item["readiness_errors"] = quality["errors"]
                lanes["invalid_ready"].append(item)
        else:
            lanes["other"].append(item)

    for pr in prs:
        pr_labels = label_names(pr)
        item = lane_item(pr, "pull_request")
        if labels["needs_human"] in pr_labels:
            lanes["needs_human"].append(item)
        elif labels["blocked"] in pr_labels:
            lanes["blocked"].append(item)
        elif (
            labels["review_ready"] in pr_labels
            and not pr.get("isDraft", False)
            and str(pr.get("headRefName", "")).startswith(contract["branch_prefix"])
        ):
            lanes["review_ready"].append(item)
        elif labels["in_progress"] in pr_labels or pr.get("isDraft", False):
            lanes["in_progress"].append(item)
        else:
            lanes["other"].append(item)

    for items in lanes.values():
        items.sort(key=lambda item: (item["kind"], item["number"] or 0))
    return {
        "repository": contract["repository"],
        "source": source,
        "counts": {name: len(items) for name, items in lanes.items()},
        "lanes": lanes,
    }


def gh_json(args: list[str]) -> list[dict[str, Any]]:
    result = subprocess.run(
        ["gh", *args], text=True, capture_output=True, check=False
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip() or "unknown gh error"
        raise RuntimeError(detail)
    payload = json.loads(result.stdout or "[]")
    if not isinstance(payload, list):
        raise RuntimeError("GitHub response was not a JSON list")
    return payload


def read_list(path: Path) -> list[dict[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError(f"Expected a JSON list in {path}")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issues-file", type=Path)
    parser.add_argument("--prs-file", type=Path)
    parser.add_argument("--repo")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    args = parser.parse_args()

    contract = json.loads(args.contract.read_text(encoding="utf-8"))
    if bool(args.issues_file) != bool(args.prs_file):
        parser.error("--issues-file and --prs-file must be supplied together")

    if args.issues_file:
        issues = read_list(args.issues_file)
        prs = read_list(args.prs_file)
        source = "fixture"
    else:
        repo = args.repo or contract["repository"]
        try:
            issues = gh_json(
                [
                    "issue",
                    "list",
                    "--repo",
                    repo,
                    "--state",
                    "open",
                    "--limit",
                    "100",
                    "--json",
                    "number,title,body,labels,state,url",
                ]
            )
            prs = gh_json(
                [
                    "pr",
                    "list",
                    "--repo",
                    repo,
                    "--state",
                    "open",
                    "--limit",
                    "50",
                    "--json",
                    "number,title,body,headRefName,isDraft,labels,statusCheckRollup,url",
                ]
            )
        except (RuntimeError, json.JSONDecodeError) as error:
            print(json.dumps({"ok": False, "error": str(error)}, indent=2))
            return 2
        source = f"github:{repo}"

    print(json.dumps(build_report(issues, prs, source=source, contract=contract), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
