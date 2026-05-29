# LLM Stream Guard GitHub Action

Composite action wrapping `llm-stream-guard` CLI for CI: policy validation, stream scan, static manifest audit, and optional baseline diff.

## Usage

```yaml
- uses: 01laky/llm-stream-guard/action@v0.8.2
  with:
    policy: policies/agent-gate.json
    scan-paths: test/fixtures/events/
    static-root: .
    manifest: tools/manifest.json
    baseline-policy: policies/agent-gate.baseline.json
    fail-on: any
    annotate: true
    sarif-out: findings.sarif
```

Pin `@v0.8.2` for semver (or `@main` for bleeding edge). A floating `@v1` tag requires a separate `v1` git tag on the release commit.

See [Getting started](../docs/getting-started.md) for policy basics and [CI guide](../docs/ci-github-action.md) for matrix workflows.

## Inputs

| Input             | Required | Default | Description                                       |
| ----------------- | -------- | ------- | ------------------------------------------------- |
| `policy`          | yes      | —       | Primary policy path                               |
| `policy-dir`      | no       | `''`    | Multi-policy static audit directory               |
| `baseline-policy` | no       | `''`    | Runs `diff baseline policy --check` before scans  |
| `scan-paths`      | no       | `''`    | Comma/newline-separated paths for `scan`          |
| `static-root`     | no       | `.`     | Root for `audit static`                           |
| `manifest`        | no       | `''`    | Explicit manifest (else auto-discover)            |
| `include`         | no       | `''`    | Path prefix filter (comma-separated)              |
| `exclude`         | no       | `''`    | Path prefix exclusions                            |
| `fail-on`         | no       | `any`   | `violations`, `drift`, `static`, `any`, or `none` |
| `annotate`        | no       | `true`  | GitHub workflow command annotations               |
| `sarif-out`       | no       | `''`    | SARIF preview output path                         |
| `mode`            | no       | `''`    | Sets `GUARD_MODE`                                 |

## Outputs

| Output            | Description                       |
| ----------------- | --------------------------------- |
| `violations`      | Stream scan violation count       |
| `drift-count`     | Drift findings from static audit  |
| `static-findings` | Total static findings             |
| `sarif-path`      | SARIF file path when generated    |
| `policy-changed`  | `true`/`false` from baseline diff |

## How inputs map to CLI

Implementation: [`action/run.mjs`](./run.mjs). Schema: [`action.yml`](./action.yml).

| Action input      | CLI / behavior                                                          |
| ----------------- | ----------------------------------------------------------------------- |
| `policy`          | `scan --policy`, `audit static --policy`; paths resolved from repo root |
| `baseline-policy` | `diff <baseline> <policy> --check` when both set                        |
| `scan-paths`      | `scan --policy … --json <paths…>`                                       |
| `static-root`     | `audit static --root`                                                   |
| `manifest`        | `audit static --manifest`                                               |
| `policy-dir`      | `audit static --policy-dir`                                             |
| `include`         | `audit static --include`                                                |
| `exclude`         | `audit static --exclude`                                                |
| `mode`            | Sets `GUARD_MODE` env (same as CLI)                                     |
| `sarif-out`       | `audit static --sarif-out`                                              |
| `annotate`        | Emits `::error` / `::warning` workflow commands (Action-only)           |
| `fail-on`         | Exit aggregation in `run.mjs` (Action-only)                             |

## Local smoke

From repo root after `pnpm build`:

```bash
node action/run.mjs --policy policies/agent-gate.json --static-root . --manifest tools/manifest.json
```

See [docs/ci-github-action.md](../docs/ci-github-action.md) for matrix workflows and SARIF upload snippet.
