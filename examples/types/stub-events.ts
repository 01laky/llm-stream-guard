/**
 * Stub event unions for assemble / AI SDK mappers — install real packages in your app only.
 * Kept in `.ts` (not `.d.ts`) so ambient `declare module` stubs in `stubs.d.ts` stay global.
 */

/** Stub assemble StreamEvent union — install llm-stream-assemble in your app only. */
export type StubStreamEvent =
	| { type: "text.delta"; text: string }
	| { type: "text.done"; text: string }
	| { type: "reasoning.delta"; text: string }
	| { type: "reasoning.done"; text: string }
	| { type: "tool_call.delta"; id: string; name: string; argsText: string }
	| { type: "tool_call.done"; id: string; name: string; args: Record<string, unknown> }
	| { type: "error"; message: string; code?: string }
	| { type: "finish"; reason?: string };

/** Stub Vercel AI SDK stream part — install @ai-sdk/* in your app only. */
export type StubTextStreamPart =
	| { type: "text-delta"; textDelta: string }
	| { type: "text"; text: string }
	| { type: "tool-call-streaming-start"; toolCallId: string; toolName: string }
	| { type: "tool-call-delta"; toolCallId: string; argsTextDelta: string }
	| { type: "tool-call"; toolCallId: string; toolName: string; args: Record<string, unknown> }
	| { type: "finish"; finishReason?: string };
