import type { GuardEvent } from "../../src/types.js";

export const sampleEvents: GuardEvent[] = [
	{ type: "text", phase: "delta", text: "Hello" },
	{ type: "text", phase: "done", text: "Hello world" },
	{
		type: "tool_call",
		phase: "delta",
		id: "call_1",
		name: "search",
		argsText: '{"q":',
	},
	{
		type: "tool_call",
		phase: "done",
		id: "call_1",
		name: "search",
		args: { q: "weather" },
	},
	{ type: "reasoning", phase: "delta", text: "thinking…" },
	{ type: "reasoning", phase: "done", text: "thinking complete" },
	{ type: "error", message: "upstream failed", code: "rate_limit" },
	{ type: "finish", reason: "stop" },
];

export async function* eventsFrom<T>(items: T[]): AsyncGenerator<T> {
	for (const item of items) yield item;
}
