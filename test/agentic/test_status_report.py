from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "test" / "agentic" / "fixtures"
sys.path.insert(0, str(ROOT / "scripts" / "agentic"))

from status_report import build_report  # noqa: E402


class StatusReportTests(unittest.TestCase):
    def test_offline_fixtures_are_classified_with_stop_precedence(self) -> None:
        issues = json.loads((FIXTURES / "issues.json").read_text())
        prs = json.loads((FIXTURES / "prs.json").read_text())

        report = build_report(issues, prs, source="fixture")

        self.assertEqual([item["number"] for item in report["lanes"]["ready"]], [4])
        self.assertEqual(
            [item["number"] for item in report["lanes"]["in_progress"]], [5, 22]
        )
        self.assertEqual([item["number"] for item in report["lanes"]["blocked"]], [6])
        self.assertEqual(
            [item["number"] for item in report["lanes"]["needs_human"]], [7]
        )
        self.assertEqual(
            [item["number"] for item in report["lanes"]["review_ready"]], [21]
        )
        self.assertEqual([item["number"] for item in report["lanes"]["other"]], [8])
        self.assertEqual(
            [item["number"] for item in report["lanes"]["invalid_ready"]], [9]
        )
        self.assertTrue(report["lanes"]["invalid_ready"][0]["readiness_errors"])

    def test_draft_pr_is_not_review_ready(self) -> None:
        prs = json.loads((FIXTURES / "prs.json").read_text())
        report = build_report([], prs, source="fixture")
        self.assertNotIn(
            22, [item["number"] for item in report["lanes"]["review_ready"]]
        )


if __name__ == "__main__":
    unittest.main()
