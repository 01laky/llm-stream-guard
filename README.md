# llm-stream-guard

![core](https://img.shields.io/badge/core-0.3.0-brightgreen)
![node](https://img.shields.io/badge/node-%3E%3D18-339933)
![runtime deps](https://img.shields.io/badge/runtime_deps-0-brightgreen)
![tests](https://img.shields.io/badge/tests-480_passing-brightgreen)
[![ci](https://github.com/01laky/llm-stream-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/01laky/llm-stream-guard/actions/workflows/ci.yml)
![status](https://img.shields.io/badge/status-stable_0.3.0-brightgreen)

**Security filter for LLM streams** — redact secrets and PII, enforce tool-call policy, sanitize errors. Works on raw bytes (`TransformStream`) and parsed event streams. **Declarative JSON/YAML policies** and a **CLI** for offline scans.

> A standalone, zero-dependency TypeScript security filter for LLM proxy and agent pipelines. Byte mode: chunk-safe secret redaction on raw SSE. Event mode: tool allow/deny, arg blocking, PII & error sanitization on parsed streams. Policy files + `llm-stream-guard scan` for CI prep.

**Status:** Stable `0.3.0` — declarative policy loader, built-in profiles, and CLI (`validate`, `resolve`, `scan`, `diff`). Review [CHANGELOG.md](./CHANGELOG.md) before upgrades.

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
- [Policy files & CLI](#policy-files--cli)
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

- **Mid-chunk splits** — secrets split across TCP reads use a rolling buffer + prefix holdback (**LSG-C**).
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

| Mode    | Secrets / PII                          | Tool policy                                 |
| ------- | -------------------------------------- | ------------------------------------------- |
| `block` | Always redact                          | Safe substitute + `policy_violation` finish |
| `warn`  | Always redact                          | Block tool + `onViolation`                  |
| `audit` | Always redact + `onViolation` on match | Pass tool through + `onViolation`           |

---

## Install

```bash
pnpm add llm-stream-guard
# or npm install llm-stream-guard
```

**Requirements:** Node.js 18+ · Bun / Deno / Workers (Web Streams)

Maintainers: run [`pnpm release:prep`](./docs/publishing.md) before tagging and `npm publish`. GitHub Release notes from `CHANGELOG.md`.

---

## First success in 30 seconds

```bash
git clone git@github.com:01laky/llm-stream-guard.git
cd llm-stream-guard
pnpm install
./scripts/setup-githooks.sh
pnpm verify
```

Then pipe bytes through the byte guard:

```ts
import { createByteGuard } from "llm-stream-guard";

const guarded = sourceStream.pipeThrough(createByteGuard({ redactSecrets: true, mode: "warn" }));
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

`redactSecrets` and `sanitizeErrors` are active on `createByteGuard()` options.

### Agent (event mode)

```ts
import {
	allowTools,
	blockToolArgs,
	guardEvents,
	redactSecrets,
	sanitizeErrors,
} from "llm-stream-guard";

for await (const event of guardEvents(
	parsedEvents,
	{ mode: "block", onViolation: (v) => console.warn(v.rule, v.message) },
	redactSecrets(),
	allowTools(["search", "read_file"]),
	blockToolArgs(/rm\s+-rf/),
	sanitizeErrors(),
)) {
	if (event.type === "tool_call" && event.phase === "done") {
		await executeTool(event);
	}
}
```

### Transform ordering

Recommended pipeline:

```text
redactSecrets() → redactPII()? → allowTools/denyTools → blockToolArgs → maxToolArgsBytes → sanitizeErrors()
```

Reversing order is explicit — see [`docs/integration-cookbook.md`](./docs/integration-cookbook.md).

---

## Policy files & CLI

![Policy compile pipeline](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/policy-compile.svg)

Declarative policies map to the same rule factories as manual stacks. Built-in profiles: `proxy-strict`, `agent-gate`, `audit-only`.

### Policy file (`policies/agent-gate.json`)

```json
{
	"version": "1",
	"policyVersion": "team-alpha-v3",
	"mode": "block",
	"rules": [
		{ "allowTools": { "names": ["search", "read_file", "grep"] } },
		{ "maxToolArgsBytes": { "max": 65536 } },
		{ "sanitizeErrors": {} }
	]
}
```

### Programmatic (`loadPolicy` / `createGuardFromPolicy`)

```ts
import { createGuardFromPolicy, loadPolicy } from "llm-stream-guard";

const guard = createGuardFromPolicy(loadPolicy("./policies/agent-gate.json"));
for await (const event of guard.guard(parsedEvents)) {
	await handle(event);
}
const byteGuard = guard.createByteGuard();
```

### CLI

```bash
npx llm-stream-guard validate policies/agent-gate.json
npx llm-stream-guard resolve policies/examples/extends-agent.json
npx llm-stream-guard scan --policy policies/agent-gate.json test/fixtures/events/
cat capture.log | npx llm-stream-guard scan --policy policies/proxy-strict.json -
npx llm-stream-guard diff policies/v1.json policies/v2.json --check
npx llm-stream-guard profiles list
```

| Env variable        | Effect                                              |
| ------------------- | --------------------------------------------------- |
| `GUARD_MODE`        | Override policy `mode` (`block` / `warn` / `audit`) |
| `GUARD_POLICY_PATH` | Default `--policy` path for CLI scan                |

Schema reference: [`schemas/policy-v1.json`](./schemas/policy-v1.json). Example policies: [`policies/`](./policies/).

**Policy pitfalls:** overlapping allow/deny lists (`POLICY_E009`); empty allowlist with `mode: block` (`POLICY_E010` / `POLICY_E008`).

---

## Mode decision guide

Pick byte vs event mode in ~30 seconds:

Use the [modes diagram](#two-modes) above, or:

- **Raw SSE to browser, no parser** → `createByteGuard()`
- **Tool gate before execute** → `guardEvents()` + rule factories
- **Parse with assemble / AI SDK first** → map to `GuardEvent`, then `guardEvents()`

---

## Documentation

- [Product & technical proposal](./docs/proposal.MD)
- [Testing strategy](./docs/testing-strategy.md)
- [Publishing checklist](./docs/publishing.md) _(maintainers)_
- [Architecture diagrams](./docs/img/README.md)
- [How this compares](./docs/comparison.md)
- [Integration cookbook](./docs/integration-cookbook.md)
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

| Command                               | Description                                          |
| ------------------------------------- | ---------------------------------------------------- |
| `pnpm verify`                         | format + typecheck + build + test + fixtures + smoke |
| `pnpm verify:deps`                    | fail if runtime dependencies are added               |
| `pnpm release:prep`                   | pre-tag checks (version, CHANGELOG, dist, npm pack)  |
| `pnpm diagrams:build`                 | regenerate README SVGs from Mermaid sources          |
| `pnpm fixtures:check-policies`        | validate example + profile policies                  |
| `pnpm fixtures:audit-policy-registry` | policy fixture REGISTRY parity                       |
| `pnpm test`                           | Vitest (LSG-S/B/E/C/R/T/P/POL, LSG-REL)              |
| `pnpm bench:smoke`                    | local byte/event timing (informational)              |
| `pnpm build`                          | tsup → ESM + CJS + declarations                      |

---

## Author

**Ladislav Kostolny** — [01laky@gmail.com](mailto:01laky@gmail.com) · [GitHub @01laky](https://github.com/01laky)

## License

MIT — see [LICENSE](./LICENSE). Copyright (c) 2026 Ladislav Kostolny.
