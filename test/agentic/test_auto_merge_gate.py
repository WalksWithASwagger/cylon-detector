from __future__ import annotations

import copy
import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "test" / "agentic" / "fixtures"
sys.path.insert(0, str(ROOT / "scripts" / "agentic"))

from auto_merge_gate import evaluate_auto_merge  # noqa: E402


class AutoMergeGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads((ROOT / "agentic" / "contract.json").read_text())
        cls.issue = json.loads((FIXTURES / "valid-issue.json").read_text())
        cls.pr = json.loads((FIXTURES / "review-ready-pr.json").read_text())

    def evaluate(self, pr: dict, issue: dict | None = None) -> dict:
        return evaluate_auto_merge(issue or self.issue, pr, self.contract)

    def add_owned_file(self, issue: dict, pr: dict, path: str, rule: str | None = None) -> None:
        issue["body"] = issue["body"].replace(
            "\n\n## Acceptance Criteria",
            f"\n- `{rule or path}`\n\n## Acceptance Criteria",
        )
        pr["files"].append({"path": path, "status": "added"})
        pr["changedFiles"] += 1

    def test_all_explicit_gates_pass(self) -> None:
        result = self.evaluate(self.pr)
        self.assertTrue(result["ok"], result["reasons"])
        self.assertEqual(result["verdict"], "enable-native-auto-merge")

    def test_gate_fails_closed_without_auto_merge_opt_in(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["labels"].remove("agent:auto-merge")
        result = self.evaluate(pr)
        self.assertFalse(result["ok"])
        self.assertTrue(any("agent:auto-merge" in reason for reason in result["reasons"]))

    def test_gate_fails_closed_for_draft(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["isDraft"] = True
        self.assertFalse(self.evaluate(pr)["ok"])

    def test_gate_fails_closed_for_failed_required_check(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["statusCheckRollup"][0]["conclusion"] = "FAILURE"
        result = self.evaluate(pr)
        self.assertFalse(result["ok"])
        self.assertTrue(any("required checks" in reason for reason in result["reasons"]))

    def test_check_run_must_have_canonical_completed_shape(self) -> None:
        for mutation in ("missing_status", "in_progress", "unsupported_shape"):
            with self.subTest(mutation=mutation):
                pr = copy.deepcopy(self.pr)
                check = pr["statusCheckRollup"][0]
                if mutation == "missing_status":
                    del check["status"]
                elif mutation == "in_progress":
                    check["status"] = "IN_PROGRESS"
                else:
                    check["state"] = "SUCCESS"
                    del check["status"]
                self.assertFalse(self.evaluate(pr)["ok"])

    def test_successful_status_context_is_supported(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["statusCheckRollup"] = [{"context": "verify", "state": "SUCCESS"}]
        self.assertTrue(self.evaluate(pr)["ok"])

    def test_duplicate_check_identity_fails_closed(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["statusCheckRollup"].append(copy.deepcopy(pr["statusCheckRollup"][0]))
        self.assertFalse(self.evaluate(pr)["ok"])

    def test_file_change_status_is_required_and_unambiguous(self) -> None:
        for mutation in ("missing", "renamed", "copied", "unknown"):
            with self.subTest(mutation=mutation):
                pr = copy.deepcopy(self.pr)
                file = pr["files"][0]
                if mutation == "missing":
                    del file["status"]
                else:
                    file["status"] = mutation
                    if mutation in {"renamed", "copied"}:
                        file["previousFilename"] = "agentic/contract.json"
                self.assertFalse(self.evaluate(pr)["ok"])

    def test_removed_owned_file_uses_its_current_path_for_all_gates(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["files"][0]["status"] = "removed"
        self.assertTrue(self.evaluate(pr)["ok"])

    def test_renamed_protected_origin_cannot_escape_to_owned_safe_path(self) -> None:
        issue = copy.deepcopy(self.issue)
        pr = copy.deepcopy(self.pr)
        self.add_owned_file(issue, pr, "docs/renamed-contract.json")
        pr["files"][-1].update(
            {
                "status": "renamed",
                "previousFilename": "agentic/contract.json",
            }
        )
        result = self.evaluate(pr, issue)
        self.assertFalse(result["ok"])
        self.assertTrue(
            any("renamed" in error for error in result["pr_snapshot_errors"])
        )

    def test_gate_fails_closed_when_issue_is_not_ready(self) -> None:
        issue = copy.deepcopy(self.issue)
        issue["labels"] = []
        self.assertFalse(self.evaluate(self.pr, issue)["ok"])

    def test_gate_requires_canonical_repository_and_master_base(self) -> None:
        for field, value in (
            ("repository", "other/repository"),
            ("baseRefName", "release"),
            ("state", "MERGED"),
        ):
            with self.subTest(field=field):
                pr = copy.deepcopy(self.pr)
                pr[field] = value
                self.assertFalse(self.evaluate(pr)["ok"])

        issue = copy.deepcopy(self.issue)
        issue["repository"] = "other/repository"
        self.assertFalse(self.evaluate(self.pr, issue)["ok"])

    def test_gate_requires_complete_issue_and_pr_snapshot_identity(self) -> None:
        for field in ("repository", "number", "body", "labels", "state"):
            with self.subTest(issue_field=field):
                issue = copy.deepcopy(self.issue)
                del issue[field]
                self.assertFalse(self.evaluate(self.pr, issue)["ok"])

        for field in (
            "repository",
            "number",
            "body",
            "state",
            "baseRefName",
            "headRefName",
            "headRefOid",
            "isDraft",
            "labels",
            "linkedIssueNumber",
            "statusCheckRollup",
        ):
            with self.subTest(pr_field=field):
                pr = copy.deepcopy(self.pr)
                del pr[field]
                self.assertFalse(self.evaluate(pr)["ok"])

    def test_gate_requires_typed_complete_diff_identity(self) -> None:
        for field in ("additions", "deletions", "changedFiles", "files"):
            with self.subTest(missing=field):
                pr = copy.deepcopy(self.pr)
                del pr[field]
                self.assertFalse(self.evaluate(pr)["ok"])

        for field, value in (
            ("additions", "180"),
            ("deletions", True),
            ("changedFiles", -1),
            ("files", "package.json"),
        ):
            with self.subTest(field=field, value=value):
                pr = copy.deepcopy(self.pr)
                pr[field] = value
                self.assertFalse(self.evaluate(pr)["ok"])

    def test_changed_file_count_must_equal_unique_snapshot_files(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["changedFiles"] += 1
        self.assertFalse(self.evaluate(pr)["ok"])

    def test_max_file_limit_is_applied_to_the_actual_file_list(self) -> None:
        issue = copy.deepcopy(self.issue)
        issue["body"] = issue["body"].replace(
            "\n\n## Acceptance Criteria",
            "\n- `generated/**`\n\n## Acceptance Criteria",
        )
        pr = copy.deepcopy(self.pr)
        contract_limit = self.contract["limits"]["max_changed_files"]
        for index in range(contract_limit - len(pr["files"]) + 1):
            pr["files"].append(
                {"path": f"generated/file-{index}.txt", "status": "added"}
            )
        pr["changedFiles"] = len(pr["files"])
        self.assertEqual(pr["changedFiles"], contract_limit + 1)
        result = self.evaluate(pr, issue)
        self.assertFalse(result["checks"]["within_change_limits"])

        pr = copy.deepcopy(self.pr)
        pr["files"].append(copy.deepcopy(pr["files"][0]))
        pr["changedFiles"] += 1
        self.assertFalse(self.evaluate(pr)["ok"])

    def test_linked_issue_number_and_closing_line_bind_to_canonical_issue(self) -> None:
        pr = copy.deepcopy(self.pr)
        pr["linkedIssueNumber"] = 5
        pr["body"] = "Closes #5"
        self.assertFalse(self.evaluate(pr)["ok"])

        for body in (
            "Do not close #4",
            "This PR closes #4 after review.",
            "Context: Closes #4",
        ):
            with self.subTest(body=body):
                pr = copy.deepcopy(self.pr)
                pr["body"] = body
                self.assertFalse(self.evaluate(pr)["ok"])

    def test_gate_denies_files_outside_issue_ownership(self) -> None:
        issue = copy.deepcopy(self.issue)
        pr = copy.deepcopy(self.pr)
        pr["files"].append({"path": "src/unowned.ts", "status": "added"})
        pr["changedFiles"] += 1
        result = self.evaluate(pr, issue)
        self.assertFalse(result["ok"])
        self.assertIn("src/unowned.ts", result["unowned_paths"])

    def test_ownership_supports_exact_directory_and_glob_rules(self) -> None:
        for path, rule in (
            ("docs/operations/field-qa.md", "docs/operations/field-qa.md"),
            ("docs/operations/new-check.md", "docs/operations/"),
            ("test/e2e/new-field.spec.ts", "test/e2e/*.spec.ts"),
            ("test/agentic/deep/new.json", "test/agentic/**"),
        ):
            with self.subTest(path=path, rule=rule):
                issue = copy.deepcopy(self.issue)
                pr = copy.deepcopy(self.pr)
                if path not in {file["path"] for file in pr["files"]}:
                    self.add_owned_file(issue, pr, path, rule)
                result = self.evaluate(pr, issue)
                self.assertTrue(result["checks"]["files_within_ownership"], result)

    def test_single_star_ownership_does_not_cross_directories(self) -> None:
        issue = copy.deepcopy(self.issue)
        pr = copy.deepcopy(self.pr)
        self.add_owned_file(
            issue,
            pr,
            "test/e2e/deep/new-field.spec.ts",
            "test/e2e/*.spec.ts",
        )
        result = self.evaluate(pr, issue)
        self.assertFalse(result["checks"]["files_within_ownership"])

    def test_gate_fails_closed_for_every_protected_control_surface(self) -> None:
        for path in (
            ".github/workflows/ci.yml",
            "agentic/contract.json",
            "scripts/agentic/issue_lint.py",
            ".env.schema",
            "apps/bench/.env.schema",
            ".env",
            "apps/bench/.env.local",
            ".vercel/.env.preview.local",
            "apps/bench/.vercel/.env.production.local",
            "secrets/credentials.json",
            "secrets/access.token",
            ".npmrc",
        ):
            with self.subTest(path=path):
                issue = copy.deepcopy(self.issue)
                pr = copy.deepcopy(self.pr)
                self.add_owned_file(issue, pr, path)
                result = self.evaluate(pr, issue)
                self.assertFalse(result["ok"])
                self.assertTrue(
                    any("protected path" in reason for reason in result["reasons"])
                )

    def test_public_env_schema_is_protected_as_boundary_not_secret_material(self) -> None:
        issue = copy.deepcopy(self.issue)
        pr = copy.deepcopy(self.pr)
        self.add_owned_file(issue, pr, ".env.schema")
        result = self.evaluate(pr, issue)
        self.assertEqual(
            [match["gate"] for match in result["protected_paths"]],
            ["secret-boundary review"],
        )


if __name__ == "__main__":
    unittest.main()
