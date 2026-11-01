#!/usr/bin/env python3
"""AICR SAST runner: runs Semgrep according to .aicr/sast.yml and enforces the configured policy."""

import argparse
import fnmatch
import json
import os
import subprocess
import sys

import yaml

SEVERITIES = ["INFO", "WARNING", "ERROR"]
SEVERITY_ALIASES = {
    "LOW": "INFO",
    "MEDIUM": "WARNING",
    "HIGH": "ERROR",
    "CRITICAL": "ERROR",
    "EXPERIMENT": "INFO",
    "INVENTORY": "INFO",
}
SCAN_MODES = ["full", "diff"]

DEFAULT_CONFIG = {
    "enabled": True,
    "rulesets": ["p/default"],
    "custom_rules": [],
    "include": [],
    "exclude": [],
    "disabled_rules": [],
    "severity_overrides": {},
    "min_severity": "INFO",
    "fail_on": "ERROR",
    "scan_mode": "full",
}

SARIF_LEVELS = {"INFO": "note", "WARNING": "warning", "ERROR": "error"}


class ConfigError(Exception):
    pass


def normalize_severity(value, field, allow_none=False):
    if not isinstance(value, str):
        raise ConfigError(f"{field}: expected a severity string, got {value!r}")
    upper = value.strip().upper()
    if allow_none and upper == "NONE":
        return "NONE"
    upper = SEVERITY_ALIASES.get(upper, upper)
    if upper not in SEVERITIES:
        allowed = SEVERITIES + (["NONE"] if allow_none else [])
        raise ConfigError(f"{field}: {value!r} is not one of {', '.join(allowed)}")
    return upper


def _string_list(config, key):
    value = config[key]
    if value is None:
        return []
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ConfigError(f"{key}: expected a list of strings")
    return value


def parse_config(raw):
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise ConfigError("top level of the config must be a mapping")
    unknown = sorted(set(raw) - set(DEFAULT_CONFIG))
    if unknown:
        raise ConfigError(f"unknown key(s): {', '.join(unknown)}")

    config = {**DEFAULT_CONFIG, **raw}
    if not isinstance(config["enabled"], bool):
        raise ConfigError("enabled: expected true or false")
    for key in ("rulesets", "custom_rules", "include", "exclude", "disabled_rules"):
        config[key] = _string_list(config, key)
    if not config["rulesets"] and not config["custom_rules"]:
        raise ConfigError("at least one of rulesets / custom_rules must be set")

    overrides = config["severity_overrides"] or {}
    if not isinstance(overrides, dict):
        raise ConfigError("severity_overrides: expected a mapping of rule id -> severity")
    config["severity_overrides"] = {
        str(rule): normalize_severity(sev, f"severity_overrides.{rule}") for rule, sev in overrides.items()
    }
    config["min_severity"] = normalize_severity(config["min_severity"], "min_severity")
    config["fail_on"] = normalize_severity(config["fail_on"], "fail_on", allow_none=True)

    mode = str(config["scan_mode"]).strip().lower()
    if mode not in SCAN_MODES:
        raise ConfigError(f"scan_mode: {config['scan_mode']!r} is not one of {', '.join(SCAN_MODES)}")
    config["scan_mode"] = mode
    return config


def load_config(path):
    if not os.path.exists(path):
        print(f"[aicr-sast] {path} not found, using defaults", file=sys.stderr)
        return parse_config({})
    with open(path, encoding="utf-8") as fh:
        try:
            raw = yaml.safe_load(fh)
        except yaml.YAMLError as exc:
            raise ConfigError(f"invalid YAML: {exc}") from exc
    return parse_config(raw)


def rule_matches(rule_id, pattern):
    return rule_id == pattern or rule_id.endswith("." + pattern) or fnmatch.fnmatchcase(rule_id, pattern)


def severity_rank(severity):
    return SEVERITIES.index(severity)


def build_semgrep_command(config, output_path, baseline_commit=None, semgrep="semgrep", root="."):
    cmd = [semgrep, "scan", "--json", "--output", output_path, "--metrics", "off", "--disable-version-check"]
    for ruleset in config["rulesets"] + config["custom_rules"]:
        cmd += ["--config", ruleset]
    for pattern in config["exclude"]:
        cmd += ["--exclude", pattern.rstrip("/") or pattern]
    if config["scan_mode"] == "diff" and baseline_commit:
        cmd += ["--baseline-commit", baseline_commit]

    targets = [p for p in config["include"] if os.path.exists(os.path.join(root, p))]
    missing = sorted(set(config["include"]) - set(targets))
    if missing:
        print(f"[aicr-sast] skipping missing include path(s): {', '.join(missing)}", file=sys.stderr)
    if config["include"] and not targets:
        return None
    cmd += targets or ["."]
    return cmd


def process_results(semgrep_output, config):
    findings = []
    for result in semgrep_output.get("results", []):
        rule_id = result.get("check_id", "")
        if any(rule_matches(rule_id, p) for p in config["disabled_rules"]):
            continue
        extra = result.get("extra", {})
        severity = SEVERITY_ALIASES.get(str(extra.get("severity", "INFO")).upper(), str(extra.get("severity", "INFO")).upper())
        if severity not in SEVERITIES:
            severity = "INFO"
        for pattern, override in config["severity_overrides"].items():
            if rule_matches(rule_id, pattern):
                severity = override
                break
        if severity_rank(severity) < severity_rank(config["min_severity"]):
            continue
        findings.append(
            {
                "rule_id": rule_id,
                "severity": severity,
                "path": result.get("path", ""),
                "line": result.get("start", {}).get("line", 1),
                "end_line": result.get("end", {}).get("line", result.get("start", {}).get("line", 1)),
                "message": " ".join(str(extra.get("message", "")).split()),
            }
        )
    findings.sort(key=lambda f: (-severity_rank(f["severity"]), f["path"], f["line"]))
    return findings


def should_fail(findings, fail_on):
    if fail_on == "NONE":
        return False
    return any(severity_rank(f["severity"]) >= severity_rank(fail_on) for f in findings)


def to_sarif(findings):
    rules = {}
    for f in findings:
        rules.setdefault(
            f["rule_id"],
            {
                "id": f["rule_id"],
                "shortDescription": {"text": f["rule_id"]},
                "defaultConfiguration": {"level": SARIF_LEVELS[f["severity"]]},
            },
        )
    return {
        "$schema": "https://json.schemastore.org/sarif-2.1.0.json",
        "version": "2.1.0",
        "runs": [
            {
                "tool": {"driver": {"name": "AICR SAST (Semgrep)", "rules": list(rules.values())}},
                "results": [
                    {
                        "ruleId": f["rule_id"],
                        "level": SARIF_LEVELS[f["severity"]],
                        "message": {"text": f["message"] or f["rule_id"]},
                        "locations": [
                            {
                                "physicalLocation": {
                                    "artifactLocation": {"uri": f["path"]},
                                    "region": {"startLine": f["line"], "endLine": f["end_line"]},
                                }
                            }
                        ],
                    }
                    for f in findings
                ],
            }
        ],
    }


def to_markdown(findings, config, failed, baseline_commit=None):
    counts = {s: sum(1 for f in findings if f["severity"] == s) for s in SEVERITIES}
    status = "Failed" if failed else "Passed"
    scope = f"diff vs `{baseline_commit[:12]}`" if config["scan_mode"] == "diff" and baseline_commit else "full"
    lines = [
        "<!-- aicr-sast -->",
        f"## AICR SAST: {status}",
        "",
        f"Scan: {scope} | Fail on: `{config['fail_on']}` | Min severity: `{config['min_severity']}`",
        "",
        f"ERROR: **{counts['ERROR']}** | WARNING: **{counts['WARNING']}** | INFO: **{counts['INFO']}**",
        "",
    ]
    if findings:
        lines += ["| Severity | Rule | Location | Message |", "| --- | --- | --- | --- |"]
        for f in findings[:50]:
            message = f["message"].replace("|", "\\|")
            lines.append(f"| {f['severity']} | `{f['rule_id']}` | `{f['path']}:{f['line']}` | {message} |")
        if len(findings) > 50:
            lines.append(f"\n_{len(findings) - 50} more finding(s) omitted; see the SARIF / JSON artifacts._")
    else:
        lines.append("No findings.")
    lines.append("")
    lines.append("_Configure in `.aicr/sast.yml`._")
    return "\n".join(lines) + "\n"


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", default=os.environ.get("AICR_SAST_CONFIG", ".aicr/sast.yml"))
    parser.add_argument("--baseline-commit", default=os.environ.get("AICR_SAST_BASELINE") or None)
    parser.add_argument("--output-dir", default="aicr-sast-results")
    parser.add_argument("--semgrep", default="semgrep")
    args = parser.parse_args(argv)

    try:
        config = load_config(args.config)
    except ConfigError as exc:
        print(f"[aicr-sast] invalid config {args.config}: {exc}", file=sys.stderr)
        return 2

    if not config["enabled"]:
        print("[aicr-sast] disabled in config, skipping")
        return 0

    os.makedirs(args.output_dir, exist_ok=True)
    raw_path = os.path.join(args.output_dir, "semgrep.json")
    cmd = build_semgrep_command(config, raw_path, args.baseline_commit, args.semgrep)
    if cmd is None:
        print("[aicr-sast] no include paths exist, nothing to scan")
        semgrep_output = {"results": []}
    else:
        print("[aicr-sast] running: " + " ".join(cmd), flush=True)
        proc = subprocess.run(cmd)
        if proc.returncode not in (0, 1) or not os.path.exists(raw_path):
            print(f"[aicr-sast] semgrep failed with exit code {proc.returncode}", file=sys.stderr)
            return 2
        with open(raw_path, encoding="utf-8") as fh:
            semgrep_output = json.load(fh)
        for err in semgrep_output.get("errors", []):
            print(f"[aicr-sast] semgrep warning: {err.get('message', err)}", file=sys.stderr)

    findings = process_results(semgrep_output, config)
    failed = should_fail(findings, config["fail_on"])
    summary = to_markdown(findings, config, failed, args.baseline_commit)

    with open(os.path.join(args.output_dir, "findings.json"), "w", encoding="utf-8") as fh:
        json.dump(findings, fh, indent=2)
    with open(os.path.join(args.output_dir, "results.sarif"), "w", encoding="utf-8") as fh:
        json.dump(to_sarif(findings), fh, indent=2)
    with open(os.path.join(args.output_dir, "summary.md"), "w", encoding="utf-8") as fh:
        fh.write(summary)
    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a", encoding="utf-8") as fh:
            fh.write(summary)

    print(summary)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
