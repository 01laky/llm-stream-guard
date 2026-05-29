# SARIF rule IDs (1.0 stable)

**Status:** **1.0.0** — IDs exported via `SARIF_RULE_CATALOG` and `staticScanToSarif`.

---

## Drift (manifest vs policy)

| ID                  | Level   | Meaning                                         |
| ------------------- | ------- | ----------------------------------------------- |
| `DRIFT_ALLOW`       | error   | Manifest tool not in policy `allowTools`        |
| `DRIFT_DENY`        | error   | Denied tool still declared in manifest          |
| `DRIFT_POLICY_ONLY` | warning | Policy `allowTools` entry missing from manifest |

---

## Dangerous patterns (manifest text)

| ID     | Pattern class               |
| ------ | --------------------------- |
| `D001` | curl pipe to sh             |
| `D002` | rm -rf                      |
| `D003` | backticks                   |
| `D004` | subshell `$()`              |
| `D005` | base64 decode               |
| `D006` | private/link-local IP hints |

---

## Static blockToolArgs

| ID                  | Level   | Meaning                                                    |
| ------------------- | ------- | ---------------------------------------------------------- |
| `BLOCK_ARGS_STATIC` | warning | Manifest string matches policy `blockToolArgs` static rule |

---

## Consumer notes

- Driver `version` uses report `summary.policyVersion` when set, else package version.
- Only rules referenced by results appear in `tool.driver.rules`.
- Tests: `test/sarif-stable.test.ts` (LSG-SAR01–80).

See [static-scanning.md](./static-scanning.md) for CLI flags.
