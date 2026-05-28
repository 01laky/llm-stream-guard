import { resolve } from "node:path";
import { diffPolicies } from "../../policy/diff.js";
import { resolvePolicyDocument } from "../../policy/load.js";
import { CliExit } from "../exit-codes.js";
import { formatPolicyDiff } from "../output.js";

export function cmdDiff(rest: string[], flags: Record<string, string | boolean>): number {
	const json = flags.json === true;
	if (rest.length !== 2) {
		console.error("Usage: diff <policyA> <policyB>");
		return CliExit.usage;
	}
	const a = resolvePolicyDocument(resolve(rest[0]!));
	const b = resolvePolicyDocument(resolve(rest[1]!));
	const diff = diffPolicies(a, b);
	console.log(formatPolicyDiff(diff, json));
	if (flags.check === true && diff.changed) return CliExit.findings;
	return CliExit.ok;
}
