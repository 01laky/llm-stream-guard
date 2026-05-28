# FAQ

**Status:** **0.0.1 scaffold** — passthrough API ships; rules and npm publish in later versions.

## General

### How is this different from llm-stream-assemble?

**assemble** parses and assembles provider streams into typed events. **guard** filters what may go downstream — secrets, tool policy, sanitized errors. Separate packages, no required dependency.

### Do I need assemble?

No. Use **byte mode** on raw `response.body`, or map any parsed events to `GuardEvent` yourself.

### Is this on npm?

Not yet — `"private": true` until first intentional release. Install from git or wait for **0.1.0+**.

### What works in 0.0.1?

Passthrough `guardEvents()`, `createByteGuard()`, `pipeGuard()`, and `createGuardContext()` with full TypeScript types. Options like `redactSecrets: true` are accepted but **no-op** until **0.1.0** rule implementations land.

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
