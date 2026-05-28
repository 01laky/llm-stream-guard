export type GuardPhase = "delta" | "done";

export type GuardTextEvent = { type: "text"; phase: GuardPhase; text: string };
export type GuardToolCallEvent = {
	type: "tool_call";
	phase: GuardPhase;
	id?: string;
	name?: string;
	args?: unknown;
	argsText?: string;
};
export type GuardReasoningEvent = { type: "reasoning"; phase: GuardPhase; text: string };
export type GuardErrorEvent = { type: "error"; message: string; code?: string };
export type GuardFinishEvent = { type: "finish"; reason?: string };

export type GuardEvent =
	| GuardTextEvent
	| GuardToolCallEvent
	| GuardReasoningEvent
	| GuardErrorEvent
	| GuardFinishEvent;

export type ViolationMode = "block" | "warn" | "audit";

export type Violation = {
	rule: string;
	message: string;
	mode: ViolationMode;
	event?: GuardEvent;
};

export type GuardTransform = (
	event: GuardEvent,
	ctx: GuardContext,
) => GuardEvent | GuardEvent[] | null;

export type ByteTransform = (chunk: Uint8Array, ctx: GuardContext) => Uint8Array | Uint8Array[];

export type GuardEventsConfig = {
	mode?: ViolationMode;
	onViolation?: (violation: Violation) => void;
	transforms?: GuardTransform[];
};

export type ByteGuardOptions = {
	mode?: ViolationMode;
	onViolation?: (violation: Violation) => void;
	redactSecrets?: boolean;
	sanitizeErrors?: boolean;
};

export type CreateGuardContextOptions = {
	mode?: ViolationMode;
	onViolation?: (violation: Violation) => void;
};

/** Per-stream guard state — create one instance per stream/request. */
export type GuardContext = {
	readonly mode: ViolationMode;
	readonly violations: Violation[];
	readonly onViolation: ((violation: Violation) => void) | undefined;
	reset(): void;
};

/** @internal Phase 1 byte pipeline slots — not part of public API. */
export type GuardContextState = {
	byteLookback: Uint8Array;
	pendingUtf8: Uint8Array;
};
