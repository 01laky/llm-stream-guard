# llm-stream-guard

![core](https://img.shields.io/badge/core-0.0.1-orange)
![node](https://img.shields.io/badge/node-%3E%3D18-339933)
![runtime deps](https://img.shields.io/badge/runtime_deps-0-brightgreen)
![tests](https://img.shields.io/badge/tests-47_passing-brightgreen)
[![ci](https://github.com/01laky/llm-stream-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/01laky/llm-stream-guard/actions/workflows/ci.yml)
![status](https://img.shields.io/badge/status-0.0.1_scaffold-orange)

**Security filter for LLM streams** — redact secrets and PII, enforce tool-call policy, sanitize errors. Works on raw bytes (`TransformStream`) and parsed event streams.

> A standalone, zero-dependency TypeScript library for proxy and agent pipelines: byte mode for browser-facing SSE, event mode for tool gates before execution. **No dependency on [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble).**

**Status:** **0.0.1 scaffold** — passthrough `guardEvents()`, `createByteGuard()`, and `pipeGuard()` ship with full types and test harness; **guard rules land in 0.1.0**. Review [CHANGELOG.md](./CHANGELOG.md) before upgrades.

---

## Contents

- [Why stream guard?](#why-stream-guard)
- [Two modes](#two-modes)
- [Architecture](#architecture)
- [GuardEvent model](#guardevent-model)
- [Violation modes](#violation-modes)
- [Install](#install)
- [First success in 30 seconds](#first-success-in-30-seconds)
- [Quickstart](#quickstart)
- [Mode decision guide](#mode-decision-guide)
- [Documentation](#documentation)
- [How this compares](#how-this-compares)
- [Non-goals](#non-goals)
- [Development](#development)

---

## Why stream guard?

When proxying or running agents, unsafe content leaks downstream in predictable ways:

1. **Secrets in text deltas** — API keys, bearer tokens, JWTs echoed in model output.
2. **Dangerous tool args** — shell injection, exfil URLs, oversized JSON before execution.
3. **Unauthorized tool names** — models invoke tools outside your allowlist.
4. **Raw provider errors** — internal URLs and stack traces forwarded to browsers.

Many filters scan **raw bytes only** and miss precise policy on assembled `tool_call.done` JSON. This library targets **both byte and event modes** with zero runtime dependencies.

![Chunk redaction: secrets split across TCP reads](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/chunk-redaction.svg)

- **Mid-chunk splits** — secrets split across TCP reads need a rolling buffer, not per-chunk regex (**LSG-C** fixtures in v0.1).
- **Tool policy timing** — evaluate names early; validate args on `done` when JSON is complete (**LSG-T**).
- **Violation modes** — `block`, `warn`, or `audit` with `onViolation` for SIEM-friendly logs.

---

## Two modes

| Mode      | API                 | When                                               |
| --------- | ------------------- | -------------------------------------------------- |
| **Byte**  | `createByteGuard()` | Proxy forwards provider-shaped SSE without parsing |
| **Event** | `guardEvents()`     | Parsed stream — assemble, AI SDK, or custom mapper |

![Byte mode vs event mode](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/modes.svg)

---

## Architecture

Raw upstream content enters through **byte guard** or **event guard**; composable rules redact or block before your proxy, UI, or tool executor sees output.

![End-to-end pipeline](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/pipeline.svg)

Optional pairing with **llm-stream-assemble** (parse → guard) — cookbook only, no npm coupling:

![Ecosystem: optional assemble + guard](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/ecosystem.svg)

### Lifecycle and concurrency

Create **one `GuardContext` per stream** — never share across concurrent requests. Stateless helpers (`pipeGuard`, internal transform pipeline) compose into stateful entry points.

![GuardContext lifecycle](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/scaffold-lifecycle.svg)

Diagram sources: [`docs/img/`](./docs/img/) (Mermaid `.mmd` + committed SVG). Regenerate with `pnpm diagrams:build`.

---

## GuardEvent model

Independent event union — not `StreamEvent`, not provider types:

![GuardEvent mindmap](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/guard-event.svg)

| Type        | Shape                                           |
| ----------- | ----------------------------------------------- |
| `text`      | `{ type, phase: delta \| done, text }`          |
| `tool_call` | `{ type, phase, id?, name?, args?, argsText? }` |
| `reasoning` | `{ type, phase, text }`                         |
| `error`     | `{ type, message, code? }`                      |
| `finish`    | `{ type, reason? }`                             |

Full spec: [`docs/proposal.MD`](./docs/proposal.MD#guardevent-model-independent).

---

## Violation modes

![block / warn / audit](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/violation-modes.svg)

| Mode    | Behavior                                      |
| ------- | --------------------------------------------- |
| `block` | Safe substitute + optional terminal `finish`  |
| `warn`  | Transform + `onViolation`                     |
| `audit` | Pass through (or redact-only) + `onViolation` |

---

## Install

```bash
pnpm add llm-stream-guard
# npm install llm-stream-guard  — when published
```

**Requirements:** Node.js 18+ · Bun / Deno / Workers (Web Streams)

_Not on npm yet — `"private": true` until first release._

---

## First success in 30 seconds

```bash
git clone git@github.com:01laky/llm-stream-guard.git
cd llm-stream-guard
pnpm install
./scripts/setup-githooks.sh
pnpm verify
```

Then pipe bytes through the identity byte guard (Phase 0 passthrough):

```ts
import { createByteGuard } from "llm-stream-guard";

const guarded = sourceStream.pipeThrough(createByteGuard({ mode: "warn" }));
```

---

## Quickstart

### Proxy (byte mode)

```ts
import { createByteGuard } from "llm-stream-guard";

return new Response(
	upstream.body!.pipeThrough(
		createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "warn" }),
	),
	{ headers: { "Content-Type": "text/event-stream" } },
);
```

`redactSecrets` / `sanitizeErrors` flags are wired in options but **no-op until 0.1.0**.

### Agent (event mode)

```ts
import { guardEvents } from "llm-stream-guard";

for await (const event of guardEvents(parsedEvents, { mode: "block" })) {
	if (event.type === "tool_call" && event.phase === "done") {
		await executeTool(event);
	}
}
```

Rule factories (`redactSecrets`, `allowTools`, `blockToolArgs`, …) ship in **0.1.0**.

---

## Mode decision guide

Pick byte vs event mode in ~30 seconds:

Use the [modes diagram](#two-modes) above, or:

- **Raw SSE to browser, no parser** → `createByteGuard()`
- **Tool gate before execute** → `guardEvents()` + tool policy rules (0.1.0)
- **Parse with assemble / AI SDK first** → map to `GuardEvent`, then `guardEvents()`

---

## Documentation

- [Product & technical proposal](./docs/proposal.MD)
- [Testing strategy](./docs/testing-strategy.md)
- [Architecture diagrams](./docs/img/README.md)
- [How this compares](./docs/comparison.md)
- [Integration cookbook](./docs/integration-cookbook.md) _(v0.3 — planned)_
- [FAQ](./docs/faq.md)
- [Contributing](./CONTRIBUTING.md)

Related: [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble) — stream parsing and assembly (separate package).

---

## How this compares

|              | llm-stream-guard           | Enterprise middleware | llm-stream-assemble  |
| ------------ | -------------------------- | --------------------- | -------------------- |
| Scope        | Stream **security** filter | Broad platform        | Stream **parsing**   |
| Byte + event | Both first-class           | Often bytes-only      | Events (after parse) |
| Tool policy  | First-class                | Varies                | Assembly only        |
| Dependencies | Zero runtime               | Varies                | Zero runtime         |

Full matrix: [`docs/comparison.md`](./docs/comparison.md).

---

## Non-goals

- No HTTP client, auth, or agent loop
- No tool execution or UI components
- No LLM-as-judge classifier
- No hard dependency on assemble, AI SDK, or LangChain
- No provider adapters (use assemble or your parser)

See [`docs/proposal.MD`](./docs/proposal.MD#non-goals).

---

## Development

```bash
pnpm install
./scripts/setup-githooks.sh
pnpm verify
```

| Command               | Description                                       |
| --------------------- | ------------------------------------------------- |
| `pnpm verify`         | format + typecheck + build + test + smoke:package |
| `pnpm verify:deps`    | fail if runtime dependencies are added            |
| `pnpm diagrams:build` | regenerate README SVGs from Mermaid sources       |
| `pnpm test`           | Vitest (LSG-S, LSG-B, LSG-E)                      |
| `pnpm build`          | tsup → ESM + CJS + declarations                   |

---

## Author

**Ladislav Kostolny** — [01laky@gmail.com](mailto:01laky@gmail.com) · [GitHub @01laky](https://github.com/01laky)

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 Ladislav Kostolny.
