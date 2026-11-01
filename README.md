This is a starter template for [Learn Next.js](https://nextjs.org/learn).

## AICR SAST

Every pull request and push to `master` runs a Semgrep-based SAST scan ([`.github/workflows/aicr-sast.yml`](.github/workflows/aicr-sast.yml)) driven by [`.aicr/sast.yml`](.aicr/sast.yml). Results are posted as a sticky PR comment, the job summary, GitHub code scanning (SARIF) and a `aicr-sast-results` artifact.

| Key | Default | Description |
| --- | --- | --- |
| `enabled` | `true` | Master switch. |
| `rulesets` | `[p/default]` | Semgrep registry rulesets or local rule paths. |
| `custom_rules` | `[]` | Project rule files/dirs, e.g. [`.aicr/rules`](.aicr/rules). |
| `include` | `[]` (whole repo) | Paths to scan. |
| `exclude` | `[]` | Paths/globs to skip. |
| `disabled_rules` | `[]` | Rule IDs to ignore: exact ID, trailing segment(s) (`eval-usage`) or glob (`*.audit.*`). |
| `severity_overrides` | `{}` | `rule id/glob: INFO\|WARNING\|ERROR` to re-grade findings. |
| `min_severity` | `INFO` | Drop findings below this severity. |
| `fail_on` | `ERROR` | Fail the check on findings at/above this severity (`NONE` = never fail). |
| `scan_mode` | `full` | `diff` = on PRs only report findings introduced against the base commit. |

Unknown keys or invalid values fail the job with a config error. Run locally:

```bash
pip install semgrep==1.180.0 pyyaml
python scripts/aicr_sast.py                      # full scan
python scripts/aicr_sast.py --baseline-commit origin/master   # diff scan (scan_mode: diff)
python -m unittest discover -s scripts/tests     # runner tests
```

Exit codes: `0` passed, `1` findings at/above `fail_on`, `2` config or Semgrep error. `--config` / `AICR_SAST_CONFIG` select a different config file.
