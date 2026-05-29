# Integration cookbook

**Status:** **0.7.0** — adoption guide with typechecked examples under [`examples/`](../examples/README.md).  
**Prerequisite:** Read [Getting started](./getting-started.md) if you are new to byte vs event mode.

Cookbook examples are **app-level only** — the guard package stays zero-dep and does not import assemble or provider SDKs.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Byte mode proxies](#2-byte-mode-proxies)
3. [Event mode tool gate](#3-event-mode-tool-gate)
4. [Policy-driven setup](#4-policy-driven-setup)
5. [Transform ordering](#5-transform-ordering)
6. [Assemble + guard](#6-assemble--guard)
7. [Vercel AI SDK](#7-vercel-ai-sdk)
8. [Dual-stream audit](#8-dual-stream-audit)
9. [MCP tool gate](#9-mcp-tool-gate)
10. [LiteLLM / gateway](#10-litellm--gateway)
11. [CI & GitHub Action](#11-ci--github-action)
12. [Migration](#12-migration)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. Prerequisites

**When to use:** Starting any integration.

- Node **18+** (Web Streams, `Readable.fromWeb`)
- `pnpm add llm-stream-guard` (or git install before npm publish)
- Read [Getting started](./getting-started.md) — byte vs event, first examples
- Choose **byte mode** (opaque SSE) vs **event mode** (parsed `GuardEvent`s) — [Mode decision guide](../README.md#mode-decision-guide)

**Policy vs manual transforms:** Same rule factories; policy files add `extends`, CLI scan, and team `policyVersion`.

**Effective mode precedence:** `GUARD_MODE` env → `LoadPolicyOptions.mode` / CLI `--mode` → policy file `mode`.

**Test IDs:** LSG-CBK01

---

## 2. Byte mode proxies

**When to use:** Proxy forwards provider-shaped SSE without parsing tool JSON.

### 2.1 Hono (LSG-CBK02)

See [`examples/byte-proxy/hono.ts`](../examples/byte-proxy/hono.ts).

```ts
import { Hono } from "hono";
import { createByteGuard } from "llm-stream-guard";

const app = new Hono();
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

| Mode    | Client sees                                    |
| ------- | ---------------------------------------------- |
| `block` | Redacted bytes; errors sanitized               |
| `warn`  | Same + `onViolation` fired                     |
| `audit` | Same as warn for bytes (secrets always redact) |

**Policy equivalent:** `policies/proxy-strict.json`

### 2.2 Express (LSG-CBK03)

Express lacks native Web Streams on `res` — use **Node 18+** `Readable.fromWeb` after `pipeThrough(createByteGuard(...))`, or prefer Hono/Fastify/raw `fetch`.

See [`examples/byte-proxy/express.ts`](../examples/byte-proxy/express.ts).

### 2.3 Cloudflare Workers (LSG-CBK04)

See [`examples/byte-proxy/workers.ts`](../examples/byte-proxy/workers.ts) — no `node:fs` / `node:child_process`.

---

## 3. Event mode tool gate

**When to use:** Agent runtime with parsed events — **guard before `executeTool()`**.

![Agent gate loop](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/agent-gate-loop.svg)

**Steps (LSG-CBK05):**

1. Parse stream to `GuardEvent`s
2. `guardEvents(source, { mode, transforms, onViolation })`
3. On `tool_call.done` with clean policy → `executeTool`
4. On violation in `block`/`warn` → `finish` with `reason: "policy_violation"`

| Mode    | Tool violation                          | Client / user copy                            |
| ------- | --------------------------------------- | --------------------------------------------- |
| `block` | `error` + `finish` / `policy_violation` | "This action was blocked by security policy." |
| `warn`  | Same as block + `onViolation`           | Same                                          |
| `audit` | Event passes + `onViolation`            | App may still execute or skip                 |

See [`examples/event-gate/agent-loop.ts`](../examples/event-gate/agent-loop.ts) (**LSG-CBK21–22**).

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

**Policy equivalent:**

```json
{
	"version": "1",
	"extends": "agent-gate",
	"mode": "block",
	"rules": [{ "allowTools": { "names": ["search", "read_file"] } }]
}
```

---

## 4. Policy-driven setup

**When to use:** One policy file for proxy, agent, and offline scan (**LSG-CBK06**).

```ts
import { createGuardFromPolicy, loadPolicy } from "llm-stream-guard";

const guard = createGuardFromPolicy(loadPolicy("./policies/agent-gate.json"));
for await (const event of guard.guard(parsedEvents)) {
	await handle(event);
}
const byteGuard = guard.createByteGuard();
```

See [`examples/event-gate/policy-driven.ts`](../examples/event-gate/policy-driven.ts) (**LSG-CBK23**).

Profile inheritance:

```json
{
	"version": "1",
	"extends": "agent-gate",
	"policyVersion": "team-alpha-v3",
	"mode": "warn",
	"rules": [{ "allowTools": { "names": ["search", "read_file", "bash"] } }]
}
```

---

## 5. Transform ordering

**When to use:** Composing manual stacks (policy `rules[]` order matches this).

```text
redactSecrets() → redactPII()? → allowTools/denyTools → blockToolArgs → maxToolArgsBytes → sanitizeErrors()
```

Secrets run before tool policy. `sanitizeErrors` last.

---

## 6. Assemble + guard

**When to use:** You parse with [llm-stream-assemble](https://github.com/01laky/llm-stream-assemble) in **your app**.

```bash
pnpm add llm-stream-assemble llm-stream-guard
```

See [`examples/assemble-mapper/stream-event-to-guard.ts`](../examples/assemble-mapper/stream-event-to-guard.ts) (**LSG-CBK07**, **LSG-CBK25**) and [ecosystem diagram](./img/ecosystem.svg).

```ts
import type { GuardEvent } from "llm-stream-guard";
import { guardEvents, redactSecrets } from "llm-stream-guard";

type StreamEvent = import("llm-stream-assemble").StreamEvent;

export function streamEventToGuardEvent(e: StreamEvent): GuardEvent | null {
	switch (e.type) {
		case "text.delta":
			return { type: "text", phase: "delta", text: e.text };
		case "text.done":
			return { type: "text", phase: "done", text: e.text };
		case "tool_call.done":
			return {
				type: "tool_call",
				phase: "done",
				id: e.id,
				name: e.name,
				args: e.args,
			};
		default:
			return null;
	}
}
```

---

## 7. Vercel AI SDK

**When to use:** AI SDK stream parts in your app — guard core has **no** `@ai-sdk/*` dependency (**LSG-CBK29**).

See [`examples/ai-sdk-mapper/map-stream-part.ts`](../examples/ai-sdk-mapper/map-stream-part.ts).

Map `text-delta`, `tool-call`, `tool-call-delta`, `finish` → `GuardEvent`, then `guardEvents(mapAiSdkStream(parts), ...)`.

---

## 8. Dual-stream audit

**When to use:** Safe client stream + server-side violation log (**LSG-CBK08**, **LSG-CBK24**).

![Dual stream](https://raw.githubusercontent.com/01laky/llm-stream-guard/main/docs/img/dual-stream.svg)

See [`examples/dual-stream/audit-side-channel.ts`](../examples/dual-stream/audit-side-channel.ts).

Secrets **always redact** in all modes. Tool `audit` passes events and fires `onViolation` for SIEM.

---

## 9. MCP tool gate

**When to use:** MCP server executes tools — map `tools/call` to `GuardEvent` first.

Deep dive: [`docs/mcp-tool-gate-recipe.md`](./mcp-tool-gate-recipe.md) (**LSG-CBK30**).

---

## 10. LiteLLM / gateway

**When to use:** Gateway returns streaming HTTP body to clients.

See [`docs/litellm-gateway-hook.md`](./litellm-gateway-hook.md) (**LSG-CBK31**) — `createByteGuard()` on response body.

---

## 11. CI & GitHub Action

**When to use:** PR checks — composite Action or manual CLI steps (**LSG-CBK09**).

**Recommended:** [`docs/ci-github-action.md`](./ci-github-action.md) — matrix workflow, SARIF preview upload, local audit CLI (**LSG-ACT16**, **LSG-ACT18**).

Minimal manual workflow (no Action):

```yaml
- run: pnpm exec llm-stream-guard validate policies/agent-gate.json
- run: pnpm exec llm-stream-guard scan --policy policies/agent-gate.json --json test/fixtures/events/ > scan.json
- run: pnpm exec llm-stream-guard audit static --policy policies/agent-gate.json --root .
- run: node --input-type=module -e "import fs from 'node:fs'; const n=JSON.parse(fs.readFileSync('scan.json','utf8')).summary.violations; if(n!==0) process.exit(1)"
```

Shell script: [`examples/policy-ci/scan-fixtures.sh`](../examples/policy-ci/scan-fixtures.sh) (**LSG-CBK27**).

Optional pre-commit: [`docs/pre-commit-recipe.md`](./pre-commit-recipe.md).

---

## 12. Migration

From regex middleware → transforms → policy → CLI scan.

See [`docs/migration-from-regex.md`](./migration-from-regex.md) (**LSG-CBK10**, **LSG-CBK32**).

---

## 13. Troubleshooting

**Test ID:** LSG-CBK34

| Mistake                                  | Fix                                                           |
| ---------------------------------------- | ------------------------------------------------------------- |
| `blockToolArgs` on delta false positives | Evaluate primarily on `tool_call.done`                        |
| Shared `GuardContext` across requests    | One context per stream / request                              |
| Empty allowlist                          | `POLICY_E008`; empty names invalid                            |
| `warn` vs `audit` for tools              | **warn blocks** like block; **audit** logs + passes           |
| Byte mode on JSON event files            | Use event mode or CLI auto-detect (`.json` events vs `.sse`)  |
| `scan` vs `validate`                     | `validate` = policy file; `scan` = logs/events against policy |

Related: [Policy files & CLI](../README.md#policy-files--cli), [FAQ](./faq.md).
