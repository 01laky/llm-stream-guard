import { matchesBlockToolArgs } from "../policy/block-tool-args-matcher.js";
import type { PolicyToolSets } from "./policy-tool-names.js";
import type { StaticPatternFinding } from "./types.js";

/** Match manifest string fields against policy blockToolArgs rules (static analysis). */
export function scanBlockToolArgsStatic(
	file: string,
	strings: Array<{ field: string; value: string; line?: number }>,
	sets: PolicyToolSets,
	policyLabel?: string,
): StaticPatternFinding[] {
	if (sets.blockToolArgs.length === 0) return [];
	const out: StaticPatternFinding[] = [];
	for (const { field, value, line } of strings) {
		if (matchesBlockToolArgs(value, sets.blockToolArgs)) {
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
	return out;
}
