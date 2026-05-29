import { getGuardContextState } from "./create-guard-context.js";
import type { GuardContext, Violation, ViolationMode } from "./types.js";

const REDACTION_RULES = new Set(["redact_secrets", "redact_pii"]);

export function recordViolation(
	ctx: GuardContext,
	violation: Omit<Violation, "mode"> & { mode?: ViolationMode },
): void {
	const state = getGuardContextState(ctx);
	const full: Violation = {
		...violation,
		mode: violation.mode ?? ctx.mode,
		...(state.policyVersion !== undefined ? { policyVersion: state.policyVersion } : {}),
		...(state.eventIndex !== undefined ? { eventIndex: state.eventIndex } : {}),
	};
	if (REDACTION_RULES.has(full.rule)) {
		state.redactions += 1;
	}
	ctx.violations.push(full);
	ctx.onViolation?.(full);
}
