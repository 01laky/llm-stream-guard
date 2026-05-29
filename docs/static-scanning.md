# Static scanning

**Status:** **0.9.0** — offline manifest audit and policy drift detection (not live stream middleware).
**CLI details:** [CLI reference § audit static](./cli-reference.md#audit-static) · **Diagram:** [static-audit-flow.svg](./img/static-audit-flow.svg)

Catch unsafe tool definitions and allowlist drift **before deploy** — complement runtime `guardEvents()` / `scan` on captured streams.

## Commands

| Command                                                                         | Purpose                                                 |
| ------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `audit validate-manifest --manifest <path>`                                     | Schema check (`version: "1"`, non-empty `tools[].name`) |
| `audit drift --policy <p> --manifest <m>`                                       | Policy vs manifest tool names only                      |
| `audit static [--policy <p>\|--policy-dir <d>] [--root <dir>] [--manifest <m>]` | Drift + dangerous patterns + `blockToolArgs` preview    |

`audit static` auto-discovers manifests under `--root` when `--manifest` is omitted. See [discovery rules](#manifest-discovery).

## Manifest formats

### Guard tools manifest v1

Canonical shape — see [`schemas/tools-manifest-v1.json`](../schemas/tools-manifest-v1.json) and repo [`tools/manifest.json`](../tools/manifest.json):

```json
{
	"version": "1",
	"tools": [
		{ "name": "search", "description": "Search the codebase" },
		{ "name": "read_file", "description": "Read a file" }
	]
}
```

Scanned string fields: `description`, `examples`, `args`, `inputSchema.default`.

### MCP-shaped JSON

Tools array without required `version` (MCP server exports):

```json
{
	"tools": [
		{ "name": "mcp_list", "inputSchema": { "type": "object" } },
		{ "name": "mcp_fetch", "description": "Fetch resource" }
	]
}
```

Also accepts OpenAI-style `{ "function": { "name": "..." } }` entries in `tools[]`.

### OpenAPI `x-tools`

Extracts from `components.x-tools` or `paths.*.{method}.x-tools` — useful for gateway tool registration blocks.

### YAML

`.yaml` / `.yml` files using the same structure (`agent.tools.yaml`, `tools/*.yaml`).

## Drift rules

Compares declared manifest tool names vs policy `allowTools` / `denyTools`:

| Code                | Severity | Meaning                                                                  |
| ------------------- | -------- | ------------------------------------------------------------------------ |
| `DRIFT_ALLOW`       | error    | Tool in manifest but not in policy `allowTools` (when allow rule exists) |
| `DRIFT_DENY`        | error    | Tool in manifest and listed in policy `denyTools`                        |
| `DRIFT_POLICY_ONLY` | warning  | Tool in policy `allowTools` but missing from manifest                    |

`--strict` promotes `DRIFT_POLICY_ONLY` to **error** and treats all dangerous-pattern hits as errors.

## Dangerous pattern catalog (D001–D006)

Bundled zero-dep rules scan manifest string fields:

| ID       | Detects                                                        |
| -------- | -------------------------------------------------------------- |
| **D001** | `curl … \| sh` pipe-to-shell                                   |
| **D002** | `rm -rf` destructive pattern                                   |
| **D003** | Backtick command execution                                     |
| **D004** | Subshell `$()`                                                 |
| **D005** | Base64 decode (`base64 -d`, `atob(`)                           |
| **D006** | Private / link-local IP hints (`10.x`, `192.168.`, `169.254.`) |

Severity: **warning** by default; **error** under `--strict`.

## blockToolArgs static preview

When policy defines `blockToolArgs` rules, manifest text is matched statically:

| Code                | Severity | Meaning                                                                    |
| ------------------- | -------- | -------------------------------------------------------------------------- |
| `BLOCK_ARGS_STATIC` | error    | Manifest field matches a policy `blockToolArgs` pattern or `contains` rule |

Runtime `blockToolArgs()` still applies on live `tool_call` events — static scan is a pre-deploy hint.

## Exit codes

Audit subcommands share unified exit codes:

| Code  | Meaning                                                                |
| ----- | ---------------------------------------------------------------------- |
| **0** | Success — no error-severity findings                                   |
| **1** | Findings — drift errors, `BLOCK_ARGS_STATIC`, or `--strict` promotions |
| **2** | Usage — missing `--policy`, bad arguments                              |
| **3** | Internal — parse/load failure, unexpected CLI error                    |

`scan` and `validate` use **0 / 1 / 2** (no dedicated **3**). The GitHub Action wrapper exits **3** only on internal CLI failures.

## Options

```bash
llm-stream-guard audit static \
  --policy policies/agent-gate.json \
  --root . \
  --include apps/agent \
  --exclude test/fixtures/tools \
  --strict \
  --quiet \
  --annotate \
  --json \
  --sarif-out findings.sarif
```

| Flag                      | Effect                                                    |
| ------------------------- | --------------------------------------------------------- |
| `--policy-dir`            | Audit against every `.json`/`.yaml` policy in a directory |
| `--include` / `--exclude` | Comma-separated path-prefix filters                       |
| `--quiet`                 | Errors only (for hooks)                                   |
| `--annotate`              | GitHub workflow commands (`::error file=…`)               |
| `--sarif-out`             | SARIF 2.1.0 preview file                                  |

Env: `GUARD_POLICY_PATH`, `GUARD_MODE`.

## Manifest discovery

Under `--root`, walks for:

- `tools/manifest.json` (or `**/tools/manifest.json`)
- `**/tools/*.{json,yaml,yml}`
- `**/*agent.tools.{yaml,yml}`

Skips `node_modules`, `.git`, `dist`, `coverage`. Default exclude: `test/fixtures/policies/invalid`.

## Related

- [GitHub Action guide](./ci-github-action.md)
- [Pre-commit recipe](./pre-commit-recipe.md)
- Fixtures: [`test/fixtures/tools/REGISTRY.md`](../test/fixtures/tools/REGISTRY.md) (**LSG-STA**)
