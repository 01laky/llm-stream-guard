/**
 * Assemble StreamEvent → GuardEvent mapper (LSG-CBK07 / LSG-CBK25).
 * Install llm-stream-assemble in your app — this file uses stub types only.
 */
import type { GuardEvent } from "llm-stream-guard";
import type { StubStreamEvent } from "../types/stub-events.js";

/**
 * Map a single assemble-shaped StreamEvent to GuardEvent (or null if not guard-relevant).
 * Mirrors docs/integration-cookbook.md §6.
 */
export function streamEventToGuardEvent(e: StubStreamEvent): GuardEvent | null {
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

/** Async adapter from assemble stream to GuardEvent stream. */
export async function* mapAssembleStream(
	source: AsyncIterable<StubStreamEvent>,
): AsyncGenerator<GuardEvent> {
	for await (const e of source) {
		const mapped = streamEventToGuardEvent(e);
		if (mapped) yield mapped;
	}
}
