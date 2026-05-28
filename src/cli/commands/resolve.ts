import { resolve } from "node:path";
import { resolvePolicyDocument } from "../../policy/load.js";
import { CliExit } from "../exit-codes.js";

export function cmdResolve(rest: string[], json: boolean): number {
	if (rest.length !== 1) {
		console.error("Usage: resolve <policy>");
		return CliExit.usage;
	}
	try {
		const doc = resolvePolicyDocument(resolve(rest[0]!));
		console.log(JSON.stringify(doc, null, json ? 2 : 0));
		return CliExit.ok;
	} catch (err) {
		console.error(String(err));
		return CliExit.findings;
	}
}
