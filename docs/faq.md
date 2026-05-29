# FAQ

**Status:** **Stable 1.0.0** — stable SARIF, `onFinish` summaries, `doctor` CLI. Publish via [`docs/publishing.md`](./publishing.md).

## Beginners

### I am new to LLM streaming — where do I start?

1. [Getting started](./getting-started.md) — 15-minute path with copy-paste examples.
2. [Concepts & glossary](./concepts-and-glossary.md) — SSE, GuardEvent, block/warn/audit.
3. [Documentation map](./docs-map.md) — choose a track (proxy, agent, CI).

### Byte mode or event mode?

- **Byte** — you forward raw `response.body` (SSE) without parsing tool JSON.
- **Event** — you parse streams and execute tools; use `allowTools` / `blockToolArgs`.

See [modes diagram](./img/modes.svg) and [Getting started § Which mode](./getting-started.md#which-mode-do-i-need).

### Do I need this if I only use ChatGPT API once per request (non-streaming)?

Usually **no** — guard targets **streams** (proxies, agents, SSE). For one-shot JSON responses, simpler output filtering may suffice. You can still use **CLI scan** on saved logs.

## General

### How is this different from llm-stream-assemble?

**assemble** parses and assembles provider streams into typed events. **guard** filters what may go downstream — secrets, tool policy, sanitized errors. Separate packages, no required dependency.

### Do I need assemble?

No. Use **byte mode** on raw `response.body`, or map any parsed events to `GuardEvent` yourself.

### Is this on npm?

Yes — install with `pnpm add llm-stream-guard` (pin `@1.0.0` for reproducible builds). See [`docs/publishing.md`](./publishing.md) for maintainer release steps.

### Is there a GitHub Action?

Yes — **`01laky/llm-stream-guard/action@v1.0.0`** validates policy, scans event fixtures, and runs static manifest audit with optional SARIF upload and PR annotations. See [`docs/ci-github-action.md`](./ci-github-action.md).

### What works in 1.0.0?

- **`onFinish` / `StreamGuardSummary`** and `summarizeGuardContext()` for metrics and audit trails.
- **Stable SARIF 2.1.0** — `staticScanToSarif`, frozen rule IDs ([sarif-rule-ids.md](./sarif-rule-ids.md)).
- **`llm-stream-guard doctor`** — local readiness checks.
- **JSON schemas** for scan, static audit, and stream summary reports.
- **Phase 10 tests** — LSG-RPT, LSG-SAR, LSG-SCH, LSG-DTR, LSG-SEC21–50, REL63–80.
- Guides: [API stability](./api-stability.md), [Threat model](./threat-model.md), [Performance](./performance.md), [Migration 0.x → 1.0](./migration-0.x-to-1.0.md), [Upgrade guide](./upgrade-guide.md).

Older version notes: [faq-archive.md](./faq-archive.md). Runnable examples: [examples/README.md](../examples/README.md).

### Can I scan logs offline without wiring the library?

Yes:

```bash
npx llm-stream-guard scan --policy ./policies/agent-gate.json path/to/events.json
npx llm-stream-guard scan --policy ./policies/proxy-strict.json ./captures/stream.sse
```

Use `--json` for machine-readable output. Set `GUARD_POLICY_PATH` as the default `--policy` path.

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
