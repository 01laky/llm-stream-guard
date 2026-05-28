import type { GuardContext, Violation, ViolationMode } from "./types.js";

export function recordViolation(
	ctx: GuardContext,
	violation: Omit<Violation, "mode"> & { mode?: ViolationMode },
): void {
	const full: Violation = { ...violation, mode: violation.mode ?? ctx.mode };
	ctx.violations.push(full);
	ctx.onViolation?.(full);
}
