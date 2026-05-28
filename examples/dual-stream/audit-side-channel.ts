/**
 * Dual-stream audit — client-safe stream + violation side channel (LSG-CBK08 / LSG-CBK24).
 */
import { allowTools, guardEvents } from "llm-stream-guard";
import type { GuardEvent, Violation } from "llm-stream-guard";

export type DualStreamResult = {
	/** Events yielded to the client (audit mode passes tool violations through). */
	clientEvents: GuardEvent[];
	/** Violations collected for server-side logging — never sent to client raw. */
	auditLog: Violation[];
};

/**
 * Forward events to the client while copying violations to auditLog.
 * Secrets still redact via transforms in all modes; tool audit mode passes events + onViolation.
 */
export async function runDualStreamAudit(
	source: AsyncIterable<GuardEvent>,
	allowedTools: string[],
): Promise<DualStreamResult> {
	const clientEvents: GuardEvent[] = [];
	const auditLog: Violation[] = [];

	for await (const event of guardEvents(
		source,
		{
			mode: "audit",
			onViolation: (v) => auditLog.push(v),
		},
		allowTools(allowedTools),
	)) {
		clientEvents.push(event);
	}

	return { clientEvents, auditLog };
}
