import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadPolicy } from "../../policy/load.js";
import type { LoadPolicyOptions } from "../../policy/types.js";
import { scanPaths, scanStdin } from "../../scan/runner.js";
import type { ViolationMode } from "../../types.js";
import { walkFiles } from "../../shared/walk.js";
import { CliExit } from "../exit-codes.js";
import { formatScanReport } from "../output.js";

export async function cmdScan(
	rest: string[],
	flags: Record<string, string | boolean>,
): Promise<number> {
	const json = flags.json === true;
	const policyPath =
		(typeof flags.policy === "string" ? flags.policy : undefined) ?? process.env.GUARD_POLICY_PATH;
	if (!policyPath) {
		console.error("scan requires --policy or GUARD_POLICY_PATH");
		return CliExit.usage;
	}
	if (!existsSync(policyPath)) {
		console.error(`Policy not found: ${policyPath}`);
		return CliExit.usage;
	}

	const modeOverride = typeof flags.mode === "string" ? (flags.mode as ViolationMode) : undefined;
	if (
		modeOverride &&
		modeOverride !== "block" &&
		modeOverride !== "warn" &&
		modeOverride !== "audit"
	) {
		console.error(`Invalid mode: ${modeOverride}`);
		return CliExit.usage;
	}

	const loadOpts: LoadPolicyOptions = {
		baseDir: dirname(resolve(policyPath)),
	};
	if (modeOverride) loadOpts.mode = modeOverride;
	const policy = loadPolicy(resolve(policyPath), loadOpts);
	const stdinFormat = typeof flags["stdin-format"] === "string" ? flags["stdin-format"] : undefined;

	if (rest.length === 0 && flags.stdin !== true) {
		console.error("Usage: scan --policy <p> <paths...|->");
		return CliExit.usage;
	}

	const useStdin = rest.length === 1 && rest[0] === "-";
	if (useStdin) {
		const report = await scanStdin(policy, stdinFormat ?? "text");
		console.log(formatScanReport(report, json));
		return report.summary.violations > 0 ? CliExit.findings : CliExit.ok;
	}

	const files = walkFiles(rest.map((p) => resolve(p)));
	const scanOpts = stdinFormat ? { stdinFormat } : undefined;
	const report = await scanPaths(files, policy, scanOpts);
	console.log(formatScanReport(report, json));
	return report.summary.violations > 0 ? CliExit.findings : CliExit.ok;
}
