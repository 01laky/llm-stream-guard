import { recordViolation } from "../record-violation.js";
import type { GuardContext, GuardEvent, GuardToolCallEvent } from "../types.js";

export function handleToolPolicyBlock(
	ctx: GuardContext,
	rule: string,
	message: string,
	event: GuardToolCallEvent,
): GuardEvent | GuardEvent[] {
	recordViolation(ctx, { rule, message, event });

	if (ctx.mode === "audit") {
		return event;
	}

	return [
		{ type: "error", message: "Policy violation" },
		{ type: "finish", reason: "policy_violation" },
	];
}

export function toolNameKnown(event: GuardToolCallEvent): boolean {
	return typeof event.name === "string" && event.name.length > 0;
}
