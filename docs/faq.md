# FAQ

**Status:** **Stable 0.5.0** — GitHub Action, static manifest audit, integration cookbook + runnable examples. Publish via [`docs/publishing.md`](./publishing.md).

## General

### How is this different from llm-stream-assemble?

**assemble** parses and assembles provider streams into typed events. **guard** filters what may go downstream — secrets, tool policy, sanitized errors. Separate packages, no required dependency.

### Do I need assemble?

No. Use **byte mode** on raw `response.body`, or map any parsed events to `GuardEvent` yourself.

### Is this on npm?

Publish-ready — run [`pnpm release:prep`](./publishing.md) then `npm publish` + GitHub Release (same flow as [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble)). Until the first tag is published, install from git:

```bash
pnpm add github:01laky/llm-stream-guard
```

### Is there a GitHub Action?

Yes — **`01laky/llm-stream-guard/action@v0.5.0`** validates policy, scans event fixtures, and runs static manifest audit with optional SARIF preview and PR annotations. See [`docs/ci-github-action.md`](./ci-github-action.md). Manual CLI steps remain in [cookbook §11](./integration-cookbook.md#11-ci--github-action).

### What works in 0.5.0?

Everything in **0.4.0** plus **GitHub Action** (`action/`), **`audit static`** / drift / dangerous-pattern catalog (**D001–D006**), SARIF preview, and pre-commit recipe. Tests: **LSG-STA01–STA35**, **LSG-ACT01–ACT18**.

### What works in 0.4.0?

Everything in **0.3.0** plus the expanded [**integration cookbook**](./integration-cookbook.md) (13 sections), **runnable examples** under [`examples/README.md`](../examples/README.md), migration/MCP/LiteLLM guides, and CI scan recipes. Tests: **LSG-CBK01–CBK34**.

### What works in 0.3.0?

Everything in **0.2.0** plus declarative **JSON/YAML policies** (`loadPolicy`, `createGuardFromPolicy`), built-in profiles (`proxy-strict`, `agent-gate`, `audit-only`), and the **`llm-stream-guard` CLI** for offline `validate`, `resolve`, `scan`, and `diff`. Tests: **LSG-POL01–POL48**.

### What works in 0.2.0?

`redactSecrets()`, `redactPII()`, tool policy factories, `sanitizeErrors()`, byte flags on `createByteGuard()`, and golden fixtures (**LSG-C/R/T**).

### Can I scan logs offline without wiring the library?

Yes — install the package and run:

```bash
npx llm-stream-guard scan --policy ./policies/agent-gate.json path/to/events.json
npx llm-stream-guard scan --policy ./policies/proxy-strict.json ./captures/stream.sse
```

Use `--json` for machine-readable output (includes `policyVersion` and effective violation `mode`). Set `GUARD_POLICY_PATH` as the default `--policy` path.

## Modes

### Byte mode vs event mode?

- **Byte** — opaque stream, proxy-first, rolling buffer for mid-chunk redaction.
- **Event** — tool allowlists and JSON arg policy on `tool_call.done`.

See [`docs/img/modes.svg`](./img/modes.svg) and README [Mode decision guide](../README.md#mode-decision-guide).

## Diagrams

### Why commit SVG if we have Mermaid?

npm and GitHub README do not execute Mermaid. Edit `.mmd`, run `pnpm diagrams:build`, commit both.

See [`docs/img/README.md`](./img/README.md).

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md).
