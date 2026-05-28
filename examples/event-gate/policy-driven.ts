/**
 * Policy-driven agent gate — loadPolicy + createGuardFromPolicy (LSG-CBK06 / LSG-CBK23).
 */
import { createGuardFromPolicy, loadPolicy } from "llm-stream-guard";
import type { GuardEvent } from "llm-stream-guard";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Build a guarded event iterator from a policy file on disk.
 * Effective mode: GUARD_MODE env → load options → policy file (see applyModeOverride).
 */
export function createPolicyDrivenGuard(policyPath = join(repoRoot, "policies/agent-gate.json")) {
	const loaded = loadPolicy(policyPath);
	return createGuardFromPolicy(loaded);
}

/** Example: drain guarded events from a parsed stream. */
export async function drainPolicyGuardedEvents(
	source: AsyncIterable<GuardEvent>,
	policyPath?: string,
): Promise<GuardEvent[]> {
	const guard = createPolicyDrivenGuard(policyPath);
	const out: GuardEvent[] = [];
	for await (const event of guard.guard(source)) {
		out.push(event);
	}
	return out;
}
