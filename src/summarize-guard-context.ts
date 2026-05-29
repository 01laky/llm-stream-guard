import type { GuardContext, StreamGuardSummary, ViolationMode } from "./types.js";
import { getGuardContextState } from "./create-guard-context.js";

/** Aggregate per-stream violations, rule counts, and tool names for reporting. */
export function summarizeGuardContext(ctx: GuardContext): StreamGuardSummary {
	const state = getGuardContextState(ctx);
	const countsByRule: Record<string, number> = {};
	const toolsSet = new Set<string>();

	for (const v of ctx.violations) {
		countsByRule[v.rule] = (countsByRule[v.rule] ?? 0) + 1;
		if (v.event?.type === "tool_call" && v.event.name) {
			toolsSet.add(v.event.name);
		}
	}

	return {
		violations: [...ctx.violations],
		countsByRule,
		toolsTouched: [...toolsSet].sort(),
		redactions: state.redactions,
		...(state.policyVersion ? { policyVersion: state.policyVersion } : {}),
		mode: ctx.mode as ViolationMode,
	};
}
