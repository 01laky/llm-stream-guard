import { handleToolPolicyBlock, toolNameKnown } from "./tool-policy-common.js";
import type { GuardTransform } from "../types.js";

/** Block listed tool names. */
export function denyTools(names: string[]): GuardTransform {
	const denied = new Set(names);
	return (event, ctx) => {
		if (event.type !== "tool_call" || !toolNameKnown(event)) return event;
		if (!denied.has(event.name!)) return event;
		return handleToolPolicyBlock(ctx, "deny_tools", `Tool "${event.name}" is denied`, event);
	};
}
