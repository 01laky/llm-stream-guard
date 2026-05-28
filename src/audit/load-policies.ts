import { basename, join, resolve } from "node:path";
import { readdirSync } from "node:fs";
import { loadPolicy } from "../policy/load.js";
import { extractPolicyToolSets } from "./policy-tool-names.js";
import type { StaticScanOptions } from "./static-scan.js";

export type LoadedPolicyEntry = {
	path: string;
	label: string;
	sets: ReturnType<typeof extractPolicyToolSets>;
	version?: string;
};

/** Load one or more policies for static audit (single loadPolicy call per file). */
export function loadPoliciesForScan(opts: StaticScanOptions): LoadedPolicyEntry[] {
	const out: LoadedPolicyEntry[] = [];
	if (opts.policy) {
		out.push(loadOnePolicy(opts.policy, basename(opts.policy)));
	}
	if (opts.policyDir) {
		const dir = resolve(opts.policyDir);
		let files: string[];
		try {
			files = readdirSync(dir).filter(
				(f) => f.endsWith(".json") || f.endsWith(".yaml") || f.endsWith(".yml"),
			);
		} catch (err) {
			throw new Error(String(err));
		}
		for (const f of files.sort()) {
			out.push(loadOnePolicy(join(dir, f), f));
		}
	}
	return out;
}

function loadOnePolicy(filePath: string, label: string): LoadedPolicyEntry {
	const resolved = resolve(filePath);
	const loaded = loadPolicy(resolved);
	return {
		path: resolved,
		label,
		sets: extractPolicyToolSets(loaded),
		version: loaded.policyVersion ?? loaded.version,
	};
}
