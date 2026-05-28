/**
 * Agent tool gate — guard before execute (LSG-CBK05 / LSG-CBK21–22).
 */
import {
	allowTools,
	blockToolArgs,
	guardEvents,
	redactSecrets,
	sanitizeErrors,
} from "llm-stream-guard";
import type { GuardEvent, Violation, ViolationMode } from "llm-stream-guard";

/** User-facing copy when policy blocks a tool call. */
export const USER_FACING_ERRORS: Record<string, string> = {
	policy_violation: "This action was blocked by security policy.",
	allow_tools: "That tool is not allowed for this agent.",
	block_tool_args: "Tool arguments matched a blocked pattern.",
};

export type AgentLoopResult = {
	events: GuardEvent[];
	violations: Violation[];
	executed: string[];
};

/**
 * Run guard-before-execute loop: only call executeTool for clean tool_call.done events.
 * In block/warn mode, disallowed tools yield finish.reason === "policy_violation".
 */
export async function runAgentLoop(
	source: AsyncIterable<GuardEvent>,
	options: {
		mode: ViolationMode;
		allowedTools: string[];
		executeTool: (name: string, args: Record<string, unknown>) => Promise<void>;
	},
): Promise<AgentLoopResult> {
	const violations: Violation[] = [];
	const executed: string[] = [];
	const events: GuardEvent[] = [];
	let streamEndedWithViolation = false;

	for await (const event of guardEvents(
		source,
		{
			mode: options.mode,
			onViolation: (v) => violations.push(v),
		},
		redactSecrets(),
		allowTools(options.allowedTools),
		blockToolArgs(/rm\s+-rf/),
		sanitizeErrors(),
	)) {
		events.push(event);

		if (event.type === "finish" && event.reason === "policy_violation") {
			streamEndedWithViolation = true;
			continue;
		}

		if (
			!streamEndedWithViolation &&
			event.type === "tool_call" &&
			event.phase === "done" &&
			event.name
		) {
			await options.executeTool(event.name, (event.args ?? {}) as Record<string, unknown>);
			executed.push(event.name);
		}
	}

	return { events, violations, executed };
}
