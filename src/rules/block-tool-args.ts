import { recordViolation } from "../record-violation.js";
import type { GuardContext, GuardTransform } from "../types.js";
import { handleToolPolicyBlock } from "./tool-policy-common.js";

export type BlockToolArgsMatcher =
	| RegExp
	| string
	| ((args: unknown, ctx: GuardContext) => boolean);

function matchesArgs(matcher: BlockToolArgsMatcher, args: unknown, ctx: GuardContext): boolean {
	if (typeof matcher === "function") return matcher(args, ctx);
	if (typeof matcher === "string") return JSON.stringify(args).includes(matcher);
	return matcher.test(JSON.stringify(args));
}

function resolveArgs(event: { args?: unknown; argsText?: string }): unknown | undefined {
	if (event.args !== undefined) return event.args;
	if (typeof event.argsText !== "string") return undefined;
	try {
		return JSON.parse(event.argsText) as unknown;
	} catch {
		return undefined;
	}
}

/** Block tool calls when args match on `tool_call` done only. */
export function blockToolArgs(matcher: BlockToolArgsMatcher): GuardTransform {
	return (event, ctx) => {
		if (event.type !== "tool_call" || event.phase !== "done") return event;
		const args = resolveArgs(event);
		if (args === undefined) return event;
		if (!matchesArgs(matcher, args, ctx)) return event;

		if (ctx.mode === "audit") {
			recordViolation(ctx, {
				rule: "block_tool_args",
				message: "Tool args matched block policy",
				event,
			});
			return event;
		}

		return handleToolPolicyBlock(ctx, "block_tool_args", "Tool args matched block policy", event);
	};
}
