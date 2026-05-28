import { getGuardContextState } from "../create-guard-context.js";
import { recordViolation } from "../record-violation.js";
import type { GuardToolCallEvent, GuardTransform } from "../types.js";
import { handleToolPolicyBlock } from "./tool-policy-common.js";

const encoder = new TextEncoder();

/** Enforce maximum cumulative UTF-8 bytes in tool argsText per tool id. */
export function maxToolArgsBytes(maxBytes: number): GuardTransform {
	const keyByName = new Map<string, string>();
	let nextSynthetic = 0;

	function toolKey(event: GuardToolCallEvent): string {
		if (event.id) return event.id;
		const name = event.name ?? "";
		let key = keyByName.get(name);
		if (!key) {
			key = `__idx_${nextSynthetic++}`;
			keyByName.set(name, key);
		}
		return key;
	}

	return (event, ctx) => {
		if (event.type !== "tool_call") return event;

		const state = getGuardContextState(ctx);
		const key = toolKey(event);

		if (event.phase === "delta" && typeof event.argsText === "string") {
			const prev = state.toolArgsBytesById.get(key) ?? 0;
			state.toolArgsBytesById.set(key, prev + encoder.encode(event.argsText).length);
			return event;
		}

		if (event.phase === "done") {
			const total = state.toolArgsBytesById.get(key) ?? 0;
			state.toolArgsBytesById.delete(key);
			if (total <= maxBytes) return event;

			if (ctx.mode === "audit") {
				recordViolation(ctx, {
					rule: "max_tool_args_bytes",
					message: `Tool args exceeded ${maxBytes} bytes (${total})`,
					event,
				});
				return event;
			}

			return handleToolPolicyBlock(
				ctx,
				"max_tool_args_bytes",
				`Tool args exceeded ${maxBytes} bytes (${total})`,
				event,
			);
		}

		return event;
	};
}
