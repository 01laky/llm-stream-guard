import type { PolicyToolSets } from "./policy-tool-names.js";
import type { StaticPatternFinding } from "./types.js";

/** Match manifest string fields against policy blockToolArgs rules (static preview). */
export function scanBlockToolArgsStatic(
	file: string,
	strings: Array<{ field: string; value: string; line?: number }>,
	sets: PolicyToolSets,
	policyLabel?: string,
): StaticPatternFinding[] {
	if (sets.blockToolArgs.length === 0) return [];
	const out: StaticPatternFinding[] = [];
	for (const { field, value, line } of strings) {
		for (const rule of sets.blockToolArgs) {
			let hit = false;
			if (rule.pattern && rule.pattern.test(value)) hit = true;
			if (rule.contains && value.includes(rule.contains)) hit = true;
			if (hit) {
				out.push({
					code: "BLOCK_ARGS_STATIC",
					severity: "error",
					file,
					field,
					message: "Manifest text matches policy blockToolArgs rule",
					...(line !== undefined ? { line } : {}),
					...(policyLabel ? { policy: policyLabel } : {}),
				});
			}
		}
	}
	return out;
}
