import { resolve } from "node:path";
import { resolvePolicyDocument } from "../../policy/load.js";
import { validatePolicy } from "../../policy/validate.js";
import { CliExit } from "../exit-codes.js";
import { formatValidationErrors } from "../output.js";

export function cmdValidate(rest: string[], json: boolean): number {
	if (rest.length !== 1) {
		console.error("Usage: validate <policy>");
		return CliExit.usage;
	}
	try {
		const doc = resolvePolicyDocument(resolve(rest[0]!));
		const result = validatePolicy(doc);
		if (!result.ok) {
			console.error(formatValidationErrors(result.errors, json));
			return CliExit.findings;
		}
		if (json) console.log(JSON.stringify({ ok: true }, null, 2));
		return CliExit.ok;
	} catch (err) {
		console.error(String(err));
		return CliExit.findings;
	}
}
