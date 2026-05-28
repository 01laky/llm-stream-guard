# FAQ

**Status:** **0.1.2 scaffold** — passthrough API ships; npm publish-ready via [`docs/publishing.md`](./publishing.md).

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

### What works in 0.1.2?

Passthrough `guardEvents()`, `createByteGuard()`, `pipeGuard()`, and `createGuardContext()` with full TypeScript types. Options like `redactSecrets: true` are accepted but **no-op** until **0.2.0** rule implementations land.

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
