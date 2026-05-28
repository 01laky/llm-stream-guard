import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { loadPolicy, resolvePolicyDocument } from "../policy/load.js";
import { parsePolicyYaml } from "../policy/parse-yaml-minimal.js";
import { validatePolicy } from "../policy/validate.js";
import { scanBlockToolArgsStatic } from "./block-tool-args-static.js";
import { scanDangerousStrings } from "./dangerous-patterns.js";
import { computeDrift } from "./drift.js";
import { parseManifestFile } from "./extract-tools.js";
import { extractPolicyToolSets } from "./policy-tool-names.js";
import type { DriftFinding, StaticScanReport } from "./types.js";
import { walkManifestFiles } from "./walk-filters.js";

const DEFAULT_EXCLUDE_PREFIXES = ["test/fixtures/policies/invalid"];

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

type LoadedPolicyEntry = {
	path: string;
	label: string;
	sets: ReturnType<typeof extractPolicyToolSets>;
	version?: string;
};

function loadOnePolicy(filePath: string, label: string): LoadedPolicyEntry {
	const resolved = resolve(filePath);
	const doc = resolvePolicyDocument(resolved);
	const validation = validatePolicy(doc);
	if (!validation.ok) {
		throw new Error(validation.errors.map((e) => e.code).join(", "));
	}
	const loaded = loadPolicy(resolved);
	return {
		path: resolved,
		label,
		sets: extractPolicyToolSets(loaded),
		version: loaded.policyVersion ?? loaded.version,
	};
}

function loadPolicies(opts: StaticScanOptions): LoadedPolicyEntry[] {
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

function mergeExclude(opts: StaticScanOptions): string[] {
	return [...DEFAULT_EXCLUDE_PREFIXES, ...(opts.exclude ?? [])];
}

function resolveManifestFiles(opts: StaticScanOptions): string[] {
	if (opts.manifest) {
		const m = resolve(opts.manifest);
		try {
			if (statSync(m).isFile()) return [m];
		} catch {
			return [];
		}
	}
	return walkManifestFiles({
		root: resolve(opts.root),
		...(opts.include ? { include: opts.include } : {}),
		exclude: mergeExclude(opts),
	});
}

function applyStrict(drift: DriftFinding[], strict: boolean): DriftFinding[] {
	if (!strict) return drift;
	return drift.map((f) =>
		f.code === "DRIFT_POLICY_ONLY" ? { ...f, severity: "error" as const } : f,
	);
}

/** Run static manifest audit: drift + dangerous patterns + blockToolArgs preview. */
export function runStaticScan(opts: StaticScanOptions): StaticScanReport {
	const policies = loadPolicies(opts);
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

/** Format human-readable static scan output. */
export function formatStaticScanReport(report: StaticScanReport, quiet: boolean): string {
	const lines: string[] = [];
	if (!quiet) {
		lines.push(
			`Static audit: ${report.summary.manifests} manifest(s), ${report.summary.toolsDeclared} tool(s)`,
		);
	}
	const findings = [...report.drift, ...report.dangerous, ...report.blockToolArgs];
	if (findings.length === 0) {
		if (!quiet) lines.push("No findings.");
		return lines.join("\n");
	}
	for (const f of report.drift) {
		if (quiet && f.severity !== "error") continue;
		if ("tool" in f) {
			lines.push(`[${f.severity}] ${f.code} ${f.tool} @ ${f.file}: ${f.message}`);
		}
	}
	for (const f of report.dangerous) {
		if (quiet && f.severity !== "error") continue;
		lines.push(`[${f.severity}] ${f.code} ${f.field} @ ${f.file}: ${f.message}`);
	}
	for (const f of report.blockToolArgs) {
		if (quiet && f.severity !== "error") continue;
		lines.push(`[${f.severity}] ${f.code} ${f.field} @ ${f.file}: ${f.message}`);
	}
	return lines.join("\n");
}

/** Count error-severity findings (for exit code / strict). */
export function countStaticErrors(report: StaticScanReport, strict: boolean): number {
	let n = report.drift.filter((f) => f.severity === "error").length;
	n += report.blockToolArgs.filter((f) => f.severity === "error").length;
	if (strict) {
		n += report.dangerous.length;
	}
	return n;
}

/** Read manifest path for validate-manifest CLI. */
export function readManifestRaw(path: string): unknown {
	const text = readFileSync(path, "utf8");
	if (path.endsWith(".yaml") || path.endsWith(".yml")) {
		return parsePolicyYaml(text);
	}
	return JSON.parse(text) as unknown;
}
