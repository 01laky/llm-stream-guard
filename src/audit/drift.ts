import type { PolicyToolSets } from "./policy-tool-names.js";
import type { DriftFinding } from "./types.js";

/** Compare declared manifest tools vs policy allow/deny sets. */
export function computeDrift(
	manifestFile: string,
	declaredTools: string[],
	sets: PolicyToolSets,
	policyLabel?: string,
): DriftFinding[] {
	const findings: DriftFinding[] = [];
	const declared = new Set(declaredTools);

	if (sets.hasAllowRule) {
		for (const tool of declared) {
			if (!sets.allow.has(tool) && !sets.deny.has(tool)) {
				findings.push({
					code: "DRIFT_ALLOW",
					severity: "error",
					tool,
					file: manifestFile,
					message: `Tool "${tool}" declared in manifest but not in policy allowTools`,
					...(policyLabel ? { policy: policyLabel } : {}),
				});
			}
		}
		for (const allowed of sets.allow) {
			if (!declared.has(allowed)) {
				findings.push({
					code: "DRIFT_POLICY_ONLY",
					severity: "warning",
					tool: allowed,
					file: manifestFile,
					message: `Tool "${allowed}" in policy allowTools but missing from manifest`,
					...(policyLabel ? { policy: policyLabel } : {}),
				});
			}
		}
	}

	for (const tool of declared) {
		if (sets.deny.has(tool)) {
			findings.push({
				code: "DRIFT_DENY",
				severity: "error",
				tool,
				file: manifestFile,
				message: `Tool "${tool}" is declared in manifest but denied by policy`,
				...(policyLabel ? { policy: policyLabel } : {}),
			});
		}
	}

	return findings;
}
