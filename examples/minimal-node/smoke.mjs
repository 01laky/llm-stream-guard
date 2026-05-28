/**
 * Minimal smoke — loadPolicy + createGuardFromPolicy from built dist (LSG-CBK28).
 * Invoked by: pnpm examples:smoke (after pnpm build).
 */
import { createGuardFromPolicy, loadPolicy } from "../../dist/index.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const policyPath = join(root, "policies/audit-only.json");

async function* oneToolEvent() {
	yield {
		type: "tool_call",
		phase: "done",
		name: "search",
		id: "1",
		args: { q: "test" },
	};
}

const guard = createGuardFromPolicy(loadPolicy(policyPath));
let count = 0;
for await (const _ of guard.guard(oneToolEvent())) {
	count++;
}
if (count === 0) {
	console.error("smoke: expected at least one event");
	process.exit(1);
}
console.log("OK: minimal-node smoke passed");
