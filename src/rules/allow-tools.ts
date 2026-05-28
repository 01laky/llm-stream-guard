import { handleToolPolicyBlock, toolNameKnown } from "./tool-policy-common.js";
import type { GuardTransform } from "../types.js";

/** Allow only listed tool names; empty list denies all. */
export function allowTools(names: string[]): GuardTransform {
	const allowed = new Set(names);
	return (event, ctx) => {
		if (event.type !== "tool_call" || !toolNameKnown(event)) return event;
		if (allowed.has(event.name!)) return event;
		return handleToolPolicyBlock(
			ctx,
			"allow_tools",
			`Tool "${event.name}" is not in allowlist`,
			event,
		);
	};
}
