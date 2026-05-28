/**
 * Vercel AI SDK stream part → GuardEvent (LSG-CBK29).
 * Install @ai-sdk/* in your app — stub types only here.
 */
import type { GuardEvent } from "llm-stream-guard";
import type { StubTextStreamPart } from "../types/stub-events.js";

/**
 * Map one AI SDK TextStreamPart to zero or one GuardEvent.
 */
export function mapAiSdkPart(part: StubTextStreamPart): GuardEvent | null {
	switch (part.type) {
		case "text-delta":
			return { type: "text", phase: "delta", text: part.textDelta };
		case "text":
			return { type: "text", phase: "done", text: part.text };
		case "tool-call-streaming-start":
			return {
				type: "tool_call",
				phase: "delta",
				id: part.toolCallId,
				name: part.toolName,
				argsText: "",
			};
		case "tool-call-delta":
			return {
				type: "tool_call",
				phase: "delta",
				id: part.toolCallId,
				name: "",
				argsText: part.argsTextDelta,
			};
		case "tool-call":
			return {
				type: "tool_call",
				phase: "done",
				id: part.toolCallId,
				name: part.toolName,
				args: part.args,
			};
		case "finish":
			return { type: "finish", reason: part.finishReason };
		default:
			return null;
	}
}

export async function* mapAiSdkStream(
	source: AsyncIterable<StubTextStreamPart>,
): AsyncGenerator<GuardEvent> {
	for await (const part of source) {
		const mapped = mapAiSdkPart(part);
		if (mapped) yield mapped;
	}
}
