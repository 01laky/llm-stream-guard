# GitHub Action — CI audit

**Status:** **1.0.0** — composite action at [`action/`](../action/) wrapping `llm-stream-guard` CLI. See also [Getting started](./getting-started.md) and [Documentation map](./docs-map.md).

![CI action flow](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/ci-action-flow.svg)

## Quick start

```yaml
- uses: 01laky/llm-stream-guard/action@v1.0.0
  with:
    policy: policies/agent-gate.json
    scan-paths: test/fixtures/events/
    static-root: .
    manifest: tools/manifest.json
    fail-on: any
    annotate: true
```

Pin `@v1.0.0` for semver. See [`action/README.md`](../action/README.md) for all inputs and outputs.

## What it runs

1. **`validate`** — policy schema (optional **`diff baseline --check`** when `baseline-policy` is set)
2. **`scan`** — stream/event fixtures against policy (`scan-paths`)
3. **`audit static`** — tool manifest drift, dangerous patterns (D001–D006), `blockToolArgs` static analysis
4. **SARIF** — optional `--sarif-out` when `sarif-out` input is set (stable 1.x rule IDs)
5. **Fail gate** — exit 1 when `fail-on` matches findings (`violations`, `drift`, `static`, `any`, or `none`)

## Matrix workflow (LSG-ACT16)

Split stream scan and static audit so PRs show which gate failed:

```yaml
name: guard-audit

on:
  pull_request:
  push:
    branches: [main]

jobs:
  stream-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile && pnpm build
      - uses: 01laky/llm-stream-guard/action@v1.0.0
        with:
          policy: policies/agent-gate.json
          scan-paths: test/fixtures/events/
          fail-on: violations
          annotate: true

  static-audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile && pnpm build
      - uses: 01laky/llm-stream-guard/action@v1.0.0
        with:
          policy: policies/agent-gate.json
          static-root: .
          manifest: tools/manifest.json
          fail-on: drift
          sarif-out: findings.sarif
          annotate: true
```

| `fail-on`    | Fails when                                  |
| ------------ | ------------------------------------------- |
| `violations` | Stream `scan` reports policy violations     |
| `drift`      | Baseline diff or static drift errors        |
| `static`     | Any static audit error-severity finding     |
| `any`        | Any of the above (default)                  |
| `none`       | Never fail (report-only; useful with SARIF) |

## SARIF upload (LSG-ACT18)

Stable SARIF 2.1.0 export — rule IDs documented in [sarif-rule-ids.md](./sarif-rule-ids.md).

```yaml
- uses: 01laky/llm-stream-guard/action@v1.0.0
  id: guard
  with:
    policy: policies/agent-gate.json
    static-root: .
    manifest: tools/manifest.json
    sarif-out: findings.sarif
    fail-on: none

- uses: github/codeql-action/upload-sarif@v3
  if: always() && steps.guard.outputs.sarif-path != ''
  with:
    sarif_file: findings.sarif
    category: llm-stream-guard
```

Rule IDs: drift codes (`DRIFT_*`), dangerous catalog (`D001`–`D006`), and `BLOCK_ARGS_STATIC`.

## Local audit CLI

From repo root after `pnpm build` (or with `llm-stream-guard` installed):

```bash
pnpm exec llm-stream-guard validate policies/agent-gate.json
pnpm exec llm-stream-guard scan --policy policies/agent-gate.json --json test/fixtures/events/clean-tool.json
pnpm exec llm-stream-guard audit static --policy policies/agent-gate.json --root . --manifest tools/manifest.json --json
```

See [CLI reference](./cli-reference.md) and [static scanning](./static-scanning.md).
