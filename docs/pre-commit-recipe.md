# Pre-commit recipe

**Status:** **1.0.0** — optional local hook for policy validate + static manifest audit.

Fast gate before push: schema-valid policy and no drift/dangerous findings in declared tools. Does not replace CI stream `scan` on fixtures.

## Hook snippet

Add to `.pre-commit-config.yaml` (requires [pre-commit](https://pre-commit.com/) and `pnpm build` or installed `llm-stream-guard`):

```yaml
repos:
  - repo: local
    hooks:
      - id: llm-stream-guard-audit
        name: llm-stream-guard policy + static audit
        entry: bash -c 'pnpm exec llm-stream-guard validate policies/agent-gate.json && pnpm exec llm-stream-guard audit static --policy policies/agent-gate.json --root . --quiet'
        language: system
        pass_filenames: false
        files: ^(policies/|tools/)
```

Adjust `policies/agent-gate.json` to your team policy. `--quiet` prints only error-severity findings (exit **1** on drift errors, `BLOCK_ARGS_STATIC`, or `--strict` promotions).

## Without pre-commit

Append to an existing git hook (`.git/hooks/pre-commit`):

```bash
#!/usr/bin/env bash
set -euo pipefail
pnpm exec llm-stream-guard validate policies/agent-gate.json
pnpm exec llm-stream-guard audit static --policy policies/agent-gate.json --root . --quiet
```

## What it skips

- Stream **`scan`** on event fixtures (run in CI — see [GitHub Action](./ci-github-action.md))
- **`--strict`** dangerous-pattern promotion (enable in CI if desired)

## Related

- [Static scanning](./static-scanning.md) — exit codes, drift rules, D001–D006
- [Integration cookbook §11](./integration-cookbook.md#11-ci--github-action)
