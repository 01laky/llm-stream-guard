# MCP tool gate recipe

**Status:** **0.9.0** — map MCP tool calls to `GuardEvent` before server-side execution.

llm-stream-guard does **not** parse MCP wire protocol. Your MCP server handler maps incoming calls to `GuardEvent`, then runs `guardEvents()` or `createGuardFromPolicy()`.

## Mapping table

| MCP shape                             | GuardEvent                                                        |
| ------------------------------------- | ----------------------------------------------------------------- |
| `{ name, arguments }` on `tools/call` | `{ type: "tool_call", phase: "done", name, args: arguments, id }` |
| Streaming arg chunks (if any)         | `{ type: "tool_call", phase: "delta", argsText, name, id }`       |
| Server error                          | `{ type: "error", message }`                                      |
| Session end                           | `{ type: "finish", reason }`                                      |

## Example handler (pseudocode)

```ts
import { allowTools, blockToolArgs, guardEvents } from "llm-stream-guard";

async function handleMcpToolCall(call: { name: string; arguments: Record<string, unknown> }) {
	const event = {
		type: "tool_call" as const,
		phase: "done" as const,
		id: call.name,
		name: call.name,
		args: call.arguments,
	};

	const out: (typeof event)[] = [];
	for await (const e of guardEvents(
		(async function* () {
			yield event;
		})(),
		{ mode: "block" },
		allowTools(["read_file", "search"]),
		blockToolArgs(/rm\s+-rf/),
	)) {
		out.push(e as typeof event);
	}

	if (out.some((e) => e.type === "finish")) {
		throw new Error("Policy violation");
	}
	// safe to execute MCP tool against arguments
}
```

**Policy equivalent:** `policies/agent-gate.json` or `extends: "agent-gate"`.

Linked from [integration cookbook §9](./integration-cookbook.md#9-mcp-tool-gate).
