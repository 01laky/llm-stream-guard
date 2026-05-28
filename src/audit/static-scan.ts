import { scanBlockToolArgsStatic } from "./block-tool-args-static.js";
import { scanDangerousStrings } from "./dangerous-patterns.js";
import { computeDrift } from "./drift.js";
import { applyStrict } from "./format-report.js";
import { parseManifestFile } from "./extract-tools.js";
import { loadPoliciesForScan } from "./load-policies.js";
import { resolveManifestFiles } from "./resolve-manifests.js";
import type { DriftFinding, StaticScanReport } from "./types.js";

export type StaticScanOptions = {
	root: string;
	policy?: string;
	policyDir?: string;
	manifest?: string;
	include?: string[];
	exclude?: string[];
	strict?: boolean;
	mode?: string;
};

/** Run static manifest audit: drift + dangerous patterns + blockToolArgs preview. */
export function runStaticScan(opts: StaticScanOptions): StaticScanReport {
	const policies = loadPoliciesForScan(opts);
	const manifests = resolveManifestFiles(opts);
	let drift: DriftFinding[] = [];
	const dangerous = [];
	const blockToolArgs = [];
	let toolsDeclared = 0;

	for (const mf of manifests) {
		let parsed;
		try {
			parsed = parseManifestFile(mf);
		} catch {
			continue;
		}
		toolsDeclared += parsed.tools.length;
		for (const pol of policies) {
			drift.push(...computeDrift(mf, parsed.tools, pol.sets, pol.label));
		}
		dangerous.push(...scanDangerousStrings(mf, parsed.strings));
		for (const pol of policies) {
			blockToolArgs.push(...scanBlockToolArgsStatic(mf, parsed.strings, pol.sets, pol.label));
		}
	}

	drift = applyStrict(drift, opts.strict === true);

	const primary = policies[0];
	return {
		summary: {
			manifests: manifests.length,
			toolsDeclared,
			drift: drift.length,
			dangerous: dangerous.length,
			blockToolArgs: blockToolArgs.length,
			...(primary?.version ? { policyVersion: primary.version } : {}),
			mode: opts.mode ?? "audit",
		},
		drift,
		dangerous,
		blockToolArgs,
	};
}

export { countStaticErrors, formatStaticScanReport } from "./format-report.js";
