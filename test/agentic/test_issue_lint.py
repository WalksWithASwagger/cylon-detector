from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "test" / "agentic" / "fixtures"
sys.path.insert(0, str(ROOT / "scripts" / "agentic"))

from issue_lint import lint_issue  # noqa: E402


class IssueLintTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.contract = json.loads((ROOT / "agentic" / "contract.json").read_text())

    def fixture(self, name: str) -> str:
        return (FIXTURES / name).read_text()

    def test_real_child_issue_is_ready_when_canonical_label_is_applied(self) -> None:
        result = lint_issue(self.fixture("valid.md"), ["agent:ready"], self.contract)
        self.assertTrue(result["ok"], result["errors"])
        self.assertEqual(
            result["ownership_paths"],
            [
                "test/e2e/field-release.spec.ts",
                "scripts/validate-field-evidence.ts",
                "docs/operations/field-qa.md",
                "playwright.config.ts",
                "package.json",
            ],
        )
        self.assertEqual(result["ownership_path_count"], 5)

    def test_missing_context_is_actionable(self) -> None:
        result = lint_issue(
            self.fixture("missing-context.md"), ["agent:ready"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertIn("Missing required section: Context", result["errors"])

    def test_each_contract_section_is_individually_required(self) -> None:
        valid = self.fixture("valid.md")
        for title in self.contract["issue_quality"]["required_sections"]:
            body = re.sub(
                rf"(?ms)^##\s+{re.escape(title)}\s*$.*?(?=^##\s+|\Z)",
                "",
                valid,
            )
            with self.subTest(title=title):
                result = lint_issue(body, ["agent:ready"], self.contract)
                self.assertFalse(result["ok"])
                self.assertIn(f"Missing required section: {title}", result["errors"])

    def test_acceptance_requires_unchecked_checkboxes(self) -> None:
        result = lint_issue(
            self.fixture("malformed-acceptance.md"), ["agent:ready"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertTrue(
            any("unchecked markdown checkboxes" in error for error in result["errors"])
        )

    def test_ready_issue_rejects_mixed_or_completed_acceptance(self) -> None:
        body = self.fixture("valid.md").replace("- [ ] One command", "- [x] One command")
        result = lint_issue(body, ["agent:ready"], self.contract)
        self.assertFalse(result["ok"])
        self.assertTrue(
            any("must remain unchecked" in error for error in result["errors"])
        )
        self.assertEqual(result["completed_acceptance_items"], 1)

    def test_verification_requires_an_executable_command(self) -> None:
        result = lint_issue(
            self.fixture("missing-verification.md"), ["agent:ready"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertTrue(
            any("executable command" in error for error in result["errors"])
        )

    def test_out_of_scope_is_required(self) -> None:
        result = lint_issue(
            self.fixture("missing-out-of-scope.md"), ["agent:ready"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertIn("Missing required section: Out of Scope", result["errors"])

    def test_unsupported_readiness_label_is_rejected(self) -> None:
        result = lint_issue(
            self.fixture("unsupported-readiness.md"), ["agent:queued"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertIn("Unsupported readiness label: agent:queued", result["errors"])

    def test_stop_label_prevents_ready_state(self) -> None:
        result = lint_issue(
            self.fixture("valid.md"), ["agent:ready", "blocked"], self.contract
        )
        self.assertFalse(result["ok"])
        self.assertIn("Stop label present: blocked", result["errors"])


if __name__ == "__main__":
    unittest.main()
