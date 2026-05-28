#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { diffPolicies } from "../policy/diff.js";
import { loadPolicy, resolvePolicyDocument } from "../policy/load.js";
import { listProfiles, loadProfileDocument } from "../policy/merge.js";
import { parsePolicyFile } from "../policy/parse-yaml-minimal.js";
import { validatePolicy } from "../policy/validate.js";
import type { ViolationMode } from "../types.js";
import { formatPolicyDiff, formatScanReport, formatValidationErrors } from "./output.js";
import { scanPaths, scanStdin } from "./scan-runner.js";
import { walkFiles } from "./walk.js";

function usage(): string {
	return `llm-stream-guard — policy validate, scan, diff

Usage:
  llm-stream-guard validate <policy>
  llm-stream-guard resolve <policy> [--json]
  llm-stream-guard scan --policy <policy> [--mode M] [--stdin-format F] [--json] <paths...|->
  llm-stream-guard diff <policyA> <policyB> [--check] [--json]
  llm-stream-guard profiles list
  llm-stream-guard profiles show <id>

Env: GUARD_MODE, GUARD_POLICY_PATH
`;
}

function parseArgs(argv: string[]): {
	flags: Record<string, string | boolean>;
	rest: string[];
} {
	const flags: Record<string, string | boolean> = {};
	const rest: string[] = [];
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (a === "--help" || a === "-h") {
			flags.help = true;
		} else if (a === "--json") {
			flags.json = true;
		} else if (a === "--check") {
			flags.check = true;
		} else if (a === "--stdin") {
			flags.stdin = true;
		} else if (a.startsWith("--")) {
			const key = a.slice(2);
			const next = argv[i + 1];
			if (next && !next.startsWith("--")) {
				flags[key] = next;
				i++;
			} else {
				flags[key] = true;
			}
		} else {
			rest.push(a);
		}
	}
	return { flags, rest };
}

function readPolicyRaw(path: string): unknown {
	return parsePolicyFile(readFileSync(path, "utf8"), path);
}

function cmdValidate(rest: string[], json: boolean): number {
	if (rest.length !== 1) {
		console.error("Usage: validate <policy>");
		return 2;
	}
	try {
		const doc = resolvePolicyDocument(resolve(rest[0]!));
		const result = validatePolicy(doc);
		if (!result.ok) {
			console.error(formatValidationErrors(result.errors, json));
			return 1;
		}
		if (json) console.log(JSON.stringify({ ok: true }, null, 2));
		return 0;
	} catch (err) {
		console.error(String(err));
		return 1;
	}
}

function cmdResolve(rest: string[], json: boolean): number {
	if (rest.length !== 1) {
		console.error("Usage: resolve <policy>");
		return 2;
	}
	try {
		const doc = resolvePolicyDocument(resolve(rest[0]!));
		console.log(JSON.stringify(doc, null, json ? 2 : 0));
		return 0;
	} catch (err) {
		console.error(String(err));
		return 1;
	}
}

function cmdDiff(rest: string[], flags: Record<string, string | boolean>): number {
	const json = flags.json === true;
	if (rest.length !== 2) {
		console.error("Usage: diff <policyA> <policyB>");
		return 2;
	}
	const a = resolvePolicyDocument(resolve(rest[0]!));
	const b = resolvePolicyDocument(resolve(rest[1]!));
	const diff = diffPolicies(a, b);
	console.log(formatPolicyDiff(diff, json));
	if (flags.check === true && diff.changed) return 1;
	return 0;
}

function cmdProfiles(sub: string | undefined, rest: string[], json: boolean): number {
	if (sub === "list") {
		const ids = listProfiles();
		if (json) console.log(JSON.stringify(ids, null, 2));
		else console.log(ids.join("\n"));
		return 0;
	}
	if (sub === "show") {
		if (rest.length !== 1) {
			console.error("Usage: profiles show <id>");
			return 2;
		}
		try {
			const doc = loadProfileDocument(rest[0]!);
			console.log(JSON.stringify(doc, null, json ? 2 : 0));
			return 0;
		} catch {
			console.error(`Unknown profile: ${rest[0]}`);
			return 1;
		}
	}
	console.error("Usage: profiles list | profiles show <id>");
	return 2;
}

async function cmdScan(rest: string[], flags: Record<string, string | boolean>): Promise<number> {
	const json = flags.json === true;
	const policyPath =
		(typeof flags.policy === "string" ? flags.policy : undefined) ?? process.env.GUARD_POLICY_PATH;
	if (!policyPath) {
		console.error("scan requires --policy or GUARD_POLICY_PATH");
		return 2;
	}
	if (!existsSync(policyPath)) {
		console.error(`Policy not found: ${policyPath}`);
		return 2;
	}

	const modeOverride = typeof flags.mode === "string" ? (flags.mode as ViolationMode) : undefined;
	if (
		modeOverride &&
		modeOverride !== "block" &&
		modeOverride !== "warn" &&
		modeOverride !== "audit"
	) {
		console.error(`Invalid mode: ${modeOverride}`);
		return 2;
	}

	const loadOpts: import("../policy/types.js").LoadPolicyOptions = {
		baseDir: dirname(resolve(policyPath)),
	};
	if (modeOverride) loadOpts.mode = modeOverride;
	const policy = loadPolicy(resolve(policyPath), loadOpts);
	const stdinFormat = typeof flags["stdin-format"] === "string" ? flags["stdin-format"] : undefined;

	if (rest.length === 0 && flags.stdin !== true) {
		console.error("Usage: scan --policy <p> <paths...|->");
		return 2;
	}

	const useStdin = rest.length === 1 && rest[0] === "-";
	if (useStdin) {
		const report = await scanStdin(policy, stdinFormat ?? "text");
		console.log(formatScanReport(report, json));
		return report.summary.violations > 0 ? 1 : 0;
	}

	const files = walkFiles(rest.map((p) => resolve(p)));
	const scanOpts = stdinFormat ? { stdinFormat } : undefined;
	const report = await scanPaths(files, policy, scanOpts);
	console.log(formatScanReport(report, json));
	return report.summary.violations > 0 ? 1 : 0;
}

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const { flags, rest } = parseArgs(argv);

	if (flags.help === true || rest.length === 0) {
		console.log(usage());
		return rest.length === 0 ? 2 : 0;
	}

	const cmd = rest[0]!;
	const cmdRest = rest.slice(1);
	const json = flags.json === true;

	switch (cmd) {
		case "validate":
			return cmdValidate(cmdRest, json);
		case "resolve":
			return cmdResolve(cmdRest, json);
		case "diff":
			return cmdDiff(cmdRest, flags);
		case "profiles":
			return cmdProfiles(cmdRest[0], cmdRest.slice(1), json);
		case "scan":
			return cmdScan(cmdRest, flags);
		default:
			console.error(`Unknown command: ${cmd}\n${usage()}`);
			return 2;
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(err);
		process.exit(2);
	});
