# API reference index

**Status:** **1.0.0**

---

## Runtime (npm package)

| Topic                       | Doc                                                                      |
| --------------------------- | ------------------------------------------------------------------------ |
| Getting started             | [getting-started.md](../getting-started.md)                              |
| Concepts                    | [concepts-and-glossary.md](../concepts-and-glossary.md)                  |
| Policy files                | [policy-reference.md](../policy-reference.md)                            |
| CLI                         | [cli-reference.md](../cli-reference.md)                                  |
| Stability                   | [api-stability.md](../api-stability.md)                                  |
| Stream summary / `onFinish` | [migration-0.x-to-1.0.md](../migration-0.x-to-1.0.md#onfinish-reporting) |

Primary exports from `llm-stream-guard`:

- `createByteGuard`, `guardEvents`, `summarizeGuardContext`
- Rule factories: `redactSecrets`, `allowTools`, `blockToolArgs`, …
- Policy: `loadPolicy`, `createGuardFromPolicy`, `validatePolicy`

Subpath `llm-stream-guard/audit`:

- `staticScanToSarif`, `SARIF_RULE_CATALOG`

---

## JSON schemas (npm `schemas/`)

| File                                                                       | Shape                 |
| -------------------------------------------------------------------------- | --------------------- |
| [policy-v1.json](../../schemas/policy-v1.json)                             | Policy document       |
| [tools-manifest-v1.json](../../schemas/tools-manifest-v1.json)             | Tools manifest        |
| [scan-report-v1.json](../../schemas/scan-report-v1.json)                   | CLI `scan --json`     |
| [static-scan-report-v1.json](../../schemas/static-scan-report-v1.json)     | `audit static --json` |
| [stream-guard-summary-v1.json](../../schemas/stream-guard-summary-v1.json) | `onFinish` summary    |

See [schemas README](../../schemas/README.md).

---

## Examples

[examples/README.md](../../examples/README.md) — runnable recipes including `minimal-node/on-finish-summary.mjs`.
