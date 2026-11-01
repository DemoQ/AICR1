import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import aicr_sast  # noqa: E402


def result(check_id, severity, path="a.js", line=1, message="msg"):
    return {
        "check_id": check_id,
        "path": path,
        "start": {"line": line},
        "end": {"line": line},
        "extra": {"severity": severity, "message": message},
    }


class ParseConfigTest(unittest.TestCase):
    def test_defaults(self):
        config = aicr_sast.parse_config(None)
        self.assertTrue(config["enabled"])
        self.assertEqual(config["rulesets"], ["p/default"])
        self.assertEqual(config["fail_on"], "ERROR")
        self.assertEqual(config["scan_mode"], "full")

    def test_normalizes_values(self):
        config = aicr_sast.parse_config(
            {
                "rulesets": "p/javascript",
                "fail_on": "none",
                "min_severity": "medium",
                "scan_mode": "DIFF",
                "severity_overrides": {"some.rule": "high"},
            }
        )
        self.assertEqual(config["rulesets"], ["p/javascript"])
        self.assertEqual(config["fail_on"], "NONE")
        self.assertEqual(config["min_severity"], "WARNING")
        self.assertEqual(config["scan_mode"], "diff")
        self.assertEqual(config["severity_overrides"], {"some.rule": "ERROR"})

    def test_rejects_invalid(self):
        for raw in (
            {"unknown": 1},
            {"enabled": "yes"},
            {"fail_on": "SEVERE"},
            {"min_severity": "NONE"},
            {"scan_mode": "partial"},
            {"exclude": [1]},
            {"severity_overrides": ["x"]},
            {"rulesets": [], "custom_rules": []},
            ["not", "a", "mapping"],
        ):
            with self.subTest(raw=raw), self.assertRaises(aicr_sast.ConfigError):
                aicr_sast.parse_config(raw)

    def test_load_config_missing_file_uses_defaults(self):
        self.assertEqual(aicr_sast.load_config("/nonexistent/sast.yml"), aicr_sast.parse_config({}))

    def test_load_config_invalid_yaml(self):
        with tempfile.NamedTemporaryFile("w", suffix=".yml", delete=False) as fh:
            fh.write("rulesets: [unclosed\n")
        try:
            with self.assertRaises(aicr_sast.ConfigError):
                aicr_sast.load_config(fh.name)
        finally:
            os.unlink(fh.name)


class RuleMatchTest(unittest.TestCase):
    def test_matching(self):
        rule = "aicr.rules.aicr.node.eval-usage"
        self.assertTrue(aicr_sast.rule_matches(rule, rule))
        self.assertTrue(aicr_sast.rule_matches(rule, "aicr.node.eval-usage"))
        self.assertTrue(aicr_sast.rule_matches(rule, "eval-usage"))
        self.assertTrue(aicr_sast.rule_matches(rule, "*.node.*"))
        self.assertFalse(aicr_sast.rule_matches(rule, "val-usage"))
        self.assertFalse(aicr_sast.rule_matches(rule, "other"))


class ProcessResultsTest(unittest.TestCase):
    def test_filters_overrides_and_sorts(self):
        config = aicr_sast.parse_config(
            {
                "disabled_rules": ["noisy-rule"],
                "severity_overrides": {"x.upgraded": "ERROR", "x.downgraded": "INFO"},
                "min_severity": "WARNING",
            }
        )
        output = {
            "results": [
                result("x.noisy-rule", "ERROR"),
                result("x.upgraded", "INFO", path="b.js"),
                result("x.downgraded", "ERROR"),
                result("x.warn", "WARNING", path="a.js", line=3),
                result("x.pro", "HIGH", path="c.js"),
            ]
        }
        findings = aicr_sast.process_results(output, config)
        self.assertEqual(
            [(f["rule_id"], f["severity"]) for f in findings],
            [("x.upgraded", "ERROR"), ("x.pro", "ERROR"), ("x.warn", "WARNING")],
        )

    def test_should_fail(self):
        findings = [{"severity": "WARNING"}]
        self.assertTrue(aicr_sast.should_fail(findings, "WARNING"))
        self.assertTrue(aicr_sast.should_fail(findings, "INFO"))
        self.assertFalse(aicr_sast.should_fail(findings, "ERROR"))
        self.assertFalse(aicr_sast.should_fail(findings, "NONE"))
        self.assertFalse(aicr_sast.should_fail([], "INFO"))


class BuildCommandTest(unittest.TestCase):
    def test_command(self):
        with tempfile.TemporaryDirectory() as root:
            os.mkdir(os.path.join(root, "lib"))
            config = aicr_sast.parse_config(
                {
                    "rulesets": ["p/javascript"],
                    "custom_rules": [".aicr/rules"],
                    "include": ["lib/", "missing/"],
                    "exclude": ["node_modules/"],
                    "scan_mode": "diff",
                }
            )
            cmd = aicr_sast.build_semgrep_command(config, "out.json", "abc123", root=root)
        self.assertEqual(cmd[-1], "lib/")
        self.assertNotIn("missing/", cmd)
        self.assertIn("--baseline-commit", cmd)
        self.assertEqual(cmd[cmd.index("--exclude") + 1], "node_modules")
        self.assertEqual([cmd[i + 1] for i, a in enumerate(cmd) if a == "--config"], ["p/javascript", ".aicr/rules"])

    def test_full_mode_ignores_baseline_and_defaults_to_repo(self):
        config = aicr_sast.parse_config({})
        cmd = aicr_sast.build_semgrep_command(config, "out.json", "abc123")
        self.assertNotIn("--baseline-commit", cmd)
        self.assertEqual(cmd[-1], ".")

    def test_no_existing_include_paths(self):
        config = aicr_sast.parse_config({"include": ["does-not-exist/"]})
        self.assertIsNone(aicr_sast.build_semgrep_command(config, "out.json", root=tempfile.gettempdir()))


class ReportTest(unittest.TestCase):
    def test_sarif_and_markdown(self):
        config = aicr_sast.parse_config({})
        findings = [
            {"rule_id": "r1", "severity": "ERROR", "path": "a.js", "line": 2, "end_line": 2, "message": "a | b"}
        ]
        sarif = aicr_sast.to_sarif(findings)
        self.assertEqual(sarif["runs"][0]["results"][0]["level"], "error")
        self.assertEqual(sarif["runs"][0]["tool"]["driver"]["rules"][0]["id"], "r1")
        md = aicr_sast.to_markdown(findings, config, True)
        self.assertIn("AICR SAST: Failed", md)
        self.assertIn("a \\| b", md)


if __name__ == "__main__":
    unittest.main()
