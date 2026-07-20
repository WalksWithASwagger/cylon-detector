#!/usr/bin/env python3
"""Fail-closed quality gate for Cylon Detector agent-ready issues."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTRACT = ROOT / "agentic" / "contract.json"


def load_contract(path: Path = DEFAULT_CONTRACT) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def parse_labels(raw: str | None) -> list[str]:
    return [label.strip() for label in (raw or "").split(",") if label.strip()]


def normalize_labels(labels: list[Any]) -> list[str]:
    normalized: list[str] = []
    for label in labels:
        name = label.get("name") if isinstance(label, dict) else label
        if isinstance(name, str) and name.strip():
            normalized.append(name.strip())
    return normalized


def sections(body: str) -> dict[str, str]:
    matches = list(re.finditer(r"^##\s+(.+?)\s*$", body, re.MULTILINE))
    parsed: dict[str, str] = {}
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(body)
        parsed[match.group(1).strip().casefold()] = body[match.end() : end].strip()
    return parsed


def section(parsed: dict[str, str], title: str) -> str:
    return parsed.get(title.casefold(), "")


def unchecked_acceptance_items(content: str) -> list[str]:
    return re.findall(r"^-\s+\[\s\]\s+\S.*$", content, re.MULTILINE)


def completed_acceptance_items(content: str) -> list[str]:
    return re.findall(r"^-\s+\[[xX]\]\s+\S.*$", content, re.MULTILINE)


def executable_commands(content: str) -> list[str]:
    commands: list[str] = []
    for block in re.findall(r"```(?:[A-Za-z0-9_-]+)?\s*\n(.*?)```", content, re.DOTALL):
        commands.extend(line.strip() for line in block.splitlines() if line.strip())
    commands.extend(
        match.strip()
        for match in re.findall(r"^\s*-\s+`([^`]+)`\s*$", content, re.MULTILINE)
    )
    return [command for command in commands if not command.startswith("#")]


def ownership_paths(content: str) -> list[str]:
    return [
        match.strip()
        for match in re.findall(r"^\s*-\s+`([^`]+)`\s*$", content, re.MULTILINE)
    ]


def lint_issue(body: str, labels: list[Any], contract: dict[str, Any]) -> dict[str, Any]:
    parsed = sections(body)
    normalized = normalize_labels(labels)
    label_set = set(normalized)
    config = contract["labels"]
    quality = contract["issue_quality"]
    errors: list[str] = []

    for required in quality["required_sections"]:
        if not section(parsed, required):
            errors.append(f"Missing required section: {required}")

    acceptance = section(parsed, "Acceptance Criteria")
    acceptance_items = unchecked_acceptance_items(acceptance)
    completed_items = completed_acceptance_items(acceptance)
    if acceptance and not acceptance_items:
        errors.append(
            "Acceptance Criteria must contain one or more unchecked markdown checkboxes (`- [ ] ...`)."
        )
    if completed_items:
        errors.append(
            "Every Acceptance Criteria checkbox must remain unchecked while `agent:ready` is claimed."
        )

    verification = section(parsed, "Verification")
    commands = executable_commands(verification)
    if verification and not commands:
        errors.append(
            "Verification must contain at least one executable command in a fenced block or backticked list item."
        )

    ownership = section(parsed, "Ownership Surface")
    paths = ownership_paths(ownership)
    if ownership and not paths:
        errors.append("Ownership Surface must list repository-relative paths in backticks.")
    if len(paths) > contract["limits"]["max_ownership_paths"]:
        errors.append(
            "Ownership Surface exceeds the contract limit of "
            f"{contract['limits']['max_ownership_paths']} paths."
        )
    for path in paths:
        if path.startswith(("/", "../", "~")) or "/../" in path:
            errors.append(f"Ownership path must be repository-relative: {path}")

    out_of_scope = section(parsed, "Out of Scope")
    if out_of_scope and not re.search(r"^\s*-\s+\S", out_of_scope, re.MULTILINE):
        errors.append("Out of Scope must contain at least one explicit list item.")

    supported = set(config["issue_readiness"]) | set(config["pr_readiness"])
    readiness_like = {
        label
        for label in label_set
        if label.startswith("agent:") or label.endswith("-ready")
    }
    for label in sorted(readiness_like - supported):
        errors.append(f"Unsupported readiness label: {label}")

    wrong_scope = label_set & {config["review_ready"], config["auto_merge"]}
    for label in sorted(wrong_scope):
        errors.append(f"PR-only label cannot make an issue ready: {label}")

    if config["ready"] not in label_set:
        errors.append(f"Required readiness label is absent: {config['ready']}")
    for stop_label in config["stop"]:
        if stop_label in label_set:
            errors.append(f"Stop label present: {stop_label}")

    return {
        "ok": not errors,
        "errors": errors,
        "labels": sorted(label_set),
        "missing_sections": [
            required
            for required in quality["required_sections"]
            if not section(parsed, required)
        ],
        "acceptance_items": len(acceptance_items),
        "completed_acceptance_items": len(completed_items),
        "verification_commands": commands,
        "ownership_paths": paths,
        "ownership_path_count": len(paths),
        "normalized_ready_label": config["ready"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--issue-file", type=Path, required=True)
    parser.add_argument("--labels", required=True, help="Comma-separated issue labels")
    parser.add_argument("--contract", type=Path, default=DEFAULT_CONTRACT)
    args = parser.parse_args()

    result = lint_issue(
        args.issue_file.read_text(encoding="utf-8"),
        parse_labels(args.labels),
        load_contract(args.contract),
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0 if result["ok"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
