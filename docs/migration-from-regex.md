# Migration from regex middleware

**Status:** **1.0.0** — upgrade path from ad-hoc filters to llm-stream-guard.

![Migration path](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/migration-path.svg)

## Step 1 — Secret regex → `redactSecrets()`

**From:** `body.replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]")` on each chunk (leaks on split tokens).

**To:** `createByteGuard({ redactSecrets: true })` with rolling lookback (**LSG-C\***) or `redactSecrets()` on parsed events.

**Policy equivalent:**

```json
{
	"version": "1",
	"byte": { "redactSecrets": true },
	"rules": [{ "redactSecrets": {} }]
}
```

## Step 2 — Ad-hoc tool checks → `allowTools()` / policy

**From:** `if (!ALLOWED.has(toolName)) throw new Error("denied")` scattered in handlers.

**To:** `allowTools(["search", "read_file"])` in `guardEvents()` or policy file with `extends: "agent-gate"`.

**Policy equivalent:**

```json
{
	"version": "1",
	"extends": "agent-gate",
	"rules": [{ "allowTools": { "names": ["search", "read_file", "grep"] } }]
}
```

## Step 3 — Copy-pasted stacks → `loadPolicy()`

**From:** Different transform arrays in proxy vs agent vs batch job.

**To:** One `policies/team.json` loaded via `loadPolicy()` / `createGuardFromPolicy()`.

Effective **mode** precedence: `GUARD_MODE` env → `LoadPolicyOptions.mode` / CLI `--mode` → policy file `mode`.

## Step 4 — Manual log review → `llm-stream-guard scan`

**From:** Grep captured logs in staging.

**To:** CI runs `validate` + `scan --json` + `audit static` on fixtures, manifests, and captured streams.

- GitHub Action: [`docs/ci-github-action.md`](./ci-github-action.md) (`action/` composite, matrix `fail-on`, SARIF upload)
- Static manifest audit: [`docs/static-scanning.md`](./static-scanning.md)
- Cookbook §11: [integration cookbook](./integration-cookbook.md#11-ci--github-action)

See [examples/README.md](../examples/README.md).
