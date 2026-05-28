# Integration cookbook

**Status:** **0.3.0** — policy files + CLI scan; expanded patterns land in **0.4.0** (proposal v0.3).

Cookbook examples are **app-level only** — the guard package stays zero-dep and does not import assemble or provider SDKs.

## Byte mode proxy (Hono / Workers)

```ts
import { createByteGuard } from "llm-stream-guard";

app.get("/chat/stream", async (c) => {
	const upstream = await fetch(providerUrl, { headers: { Authorization: `Bearer ${key}` } });
	return new Response(
		upstream.body!.pipeThrough(
			createByteGuard({ redactSecrets: true, sanitizeErrors: true, mode: "warn" }),
		),
		{ headers: { "Content-Type": "text/event-stream" } },
	);
});
```

## Event mode tool gate

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
	{ mode: "block", onViolation: (v) => audit.log(v) },
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

## Transform ordering (recommended)

```text
redactSecrets() → redactPII()? → allowTools/denyTools → blockToolArgs → maxToolArgsBytes → sanitizeErrors()
```

Secrets run before tool policy (args may contain token-like strings). `sanitizeErrors` last so earlier rules can inspect raw error text if needed.

## StreamEvent → GuardEvent mapper (with llm-stream-assemble)

Install assemble in **your app** only — not in this package:

```bash
pnpm add llm-stream-assemble llm-stream-guard
```

```ts
import type { GuardEvent } from "llm-stream-guard";
import { guardEvents, redactSecrets } from "llm-stream-guard";

// App-level mapper — separate npm install in user app
type StreamEvent = import("llm-stream-assemble").StreamEvent;

export function streamEventToGuardEvent(e: StreamEvent): GuardEvent | null {
	switch (e.type) {
		case "text.delta":
			return { type: "text", phase: "delta", text: e.text };
		case "text.done":
			return { type: "text", phase: "done", text: e.text };
		case "reasoning.delta":
			return { type: "reasoning", phase: "delta", text: e.text };
		case "reasoning.done":
			return { type: "reasoning", phase: "done", text: e.text };
		case "tool_call.delta":
			return {
				type: "tool_call",
				phase: "delta",
				id: e.id,
				name: e.name,
				argsText: e.argsText,
			};
		case "tool_call.done":
			return {
				type: "tool_call",
				phase: "done",
				id: e.id,
				name: e.name,
				args: e.args,
			};
		case "error":
			return { type: "error", message: e.message, code: e.code };
		case "finish":
			return { type: "finish", reason: e.reason };
		default:
			return null;
	}
}

async function* mapStream(source: AsyncIterable<StreamEvent>) {
	for await (const e of source) {
		const g = streamEventToGuardEvent(e);
		if (g) yield g;
	}
}

// guardEvents(mapStream(assembleStream(body, adapter)), redactSecrets(), …)
```

## Dual stream: safe client + audit log

Use `mode: "audit"` on tool policy when you want SIEM logging without blocking; secrets still redact in all modes.

## Policy file + programmatic guard

```ts
import { createGuardFromPolicy, loadPolicy } from "llm-stream-guard";

const policy = loadPolicy("./policies/agent-gate.json");
const byteGuard = createGuardFromPolicy(policy); // TransformStream for proxy
// or: compilePolicy(policy) + manual guardEvents(..., ...compiled.transforms)
```

Profile inheritance:

```json
{
	"version": 1,
	"extends": "agent-gate",
	"mode": "warn",
	"rules": [{ "allowTools": ["search", "read_file"] }]
}
```

## CI offline scan (no app code)

```bash
pnpm exec llm-stream-guard validate policies/agent-gate.json
pnpm exec llm-stream-guard scan --policy policies/agent-gate.json --json test/fixtures/events/
```

See [`docs/img/policy-compile.svg`](./img/policy-compile.svg) and README [Policy files & CLI](../README.md#policy-files--cli).

Related assemble cookbook: [llm-stream-assemble integration-cookbook](https://github.com/01laky/llm-stream-assemble/blob/main/docs/integration-cookbook.md).
