import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AuditExit } from "../audit/exit-codes.js";
import { computeDrift } from "../audit/drift.js";
import { parseManifestFile } from "../audit/extract-tools.js";
import { extractPolicyToolSets } from "../audit/policy-tool-names.js";
import { staticScanToSarif } from "../audit/sarif.js";
import { countStaticErrors, formatStaticScanReport, runStaticScan } from "../audit/static-scan.js";
import type { DriftFinding, StaticScanReport } from "../audit/types.js";
import { validateManifestFile } from "../audit/validate-manifest.js";
import { loadPolicy } from "../policy/load.js";
import { annotateFinding } from "../shared/github-annotation.js";
import { splitCommaList } from "../shared/parse-args.js";

export type AuditRunnerFlags = Record<string, string | boolean>;

export function runAuditValidateManifest(manifestPath: string, json: boolean): number {
	const errors = validateManifestFile(resolve(manifestPath));
	if (json) {
		console.log(JSON.stringify({ ok: errors.length === 0, errors }, null, 2));
	} else if (errors.length > 0) {
		for (const e of errors) {
			console.error(`${e.path || "(root)"}: ${e.message}`);
		}
	}
	return errors.length > 0 ? AuditExit.findings : AuditExit.ok;
}

export function runAuditDrift(flags: AuditRunnerFlags, rest: string[]): number {
	const policyPath =
		(typeof flags.policy === "string" ? flags.policy : undefined) ?? process.env.GUARD_POLICY_PATH;
	const manifestPath = (typeof flags.manifest === "string" ? flags.manifest : undefined) ?? rest[0];
	if (!policyPath || !manifestPath) {
		console.error("drift requires --policy and --manifest (or manifest path argument)");
		return AuditExit.usage;
	}
	try {
		const policy = loadPolicy(resolve(policyPath));
		const sets = extractPolicyToolSets(policy);
		const parsed = parseManifestFile(resolve(manifestPath));
		const findings = computeDrift(parsed.file, parsed.tools, sets);
		const json = flags.json === true;
		if (json) {
			console.log(JSON.stringify({ findings }, null, 2));
		} else {
			for (const f of findings) {
				console.log(`[${f.severity}] ${f.code} ${f.tool}: ${f.message}`);
			}
		}
		const hasError = findings.some((f) => f.severity === "error");
		return hasError ? AuditExit.findings : AuditExit.ok;
	} catch (err) {
		console.error(String(err));
		return AuditExit.internal;
	}
}

export function runAuditStatic(flags: AuditRunnerFlags): number {
	const root = typeof flags.root === "string" ? flags.root : process.cwd();
	const strict = flags.strict === true;
	const quiet = flags.quiet === true;
	const json = flags.json === true;
	const annotate = flags.annotate === true;
	const sarifOut = typeof flags["sarif-out"] === "string" ? flags["sarif-out"] : undefined;
	const policy = typeof flags.policy === "string" ? flags.policy : process.env.GUARD_POLICY_PATH;
	const policyDir = typeof flags["policy-dir"] === "string" ? flags["policy-dir"] : undefined;

	if (!policy && !policyDir) {
		console.error("static requires --policy or --policy-dir (or GUARD_POLICY_PATH)");
		return AuditExit.usage;
	}

	try {
		const include = splitCommaList(flags.include);
		const exclude = splitCommaList(flags.exclude);
		const report = runStaticScan({
			root,
			...(policy ? { policy } : {}),
			...(policyDir ? { policyDir } : {}),
			...(typeof flags.manifest === "string" ? { manifest: flags.manifest } : {}),
			...(include ? { include } : {}),
			...(exclude ? { exclude } : {}),
			strict,
			...(typeof flags.mode === "string" ? { mode: flags.mode } : {}),
		});

		if (json) {
			console.log(JSON.stringify(report, null, 2));
		} else if (!quiet) {
			console.log(formatStaticScanReport(report, false));
		} else {
			const out = formatStaticScanReport(report, true);
			if (out) console.log(out);
		}

		if (annotate) {
			for (const f of [...report.drift, ...report.dangerous, ...report.blockToolArgs]) {
				annotateFinding(f);
			}
		}

		if (sarifOut) {
			writeFileSync(resolve(sarifOut), `${JSON.stringify(staticScanToSarif(report), null, 2)}\n`);
		}

		const errors = countStaticErrors(report, strict);
		return errors > 0 ? AuditExit.findings : AuditExit.ok;
	} catch (err) {
		console.error(String(err));
		return AuditExit.internal;
	}
}

export function runAuditSubcommand(
	sub: string | undefined,
	flags: AuditRunnerFlags,
	rest: string[],
): number {
	switch (sub) {
		case "validate-manifest": {
			const manifest = (typeof flags.manifest === "string" ? flags.manifest : undefined) ?? rest[0];
			if (!manifest) {
				console.error("Usage: audit validate-manifest --manifest <path>");
				return AuditExit.usage;
			}
			return runAuditValidateManifest(manifest, flags.json === true);
		}
		case "drift":
			return runAuditDrift(flags, rest);
		case "static":
			return runAuditStatic(flags);
		default:
			console.error("Usage: audit validate-manifest | drift | static");
			return AuditExit.usage;
	}
}

export type { DriftFinding, StaticScanReport };
