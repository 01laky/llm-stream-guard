import { listProfiles, loadProfileDocument } from "../../policy/merge.js";
import { CliExit } from "../exit-codes.js";

export function cmdProfiles(sub: string | undefined, rest: string[], json: boolean): number {
	if (sub === "list") {
		const ids = listProfiles();
		if (json) console.log(JSON.stringify(ids, null, 2));
		else console.log(ids.join("\n"));
		return CliExit.ok;
	}
	if (sub === "show") {
		if (rest.length !== 1) {
			console.error("Usage: profiles show <id>");
			return CliExit.usage;
		}
		try {
			const doc = loadProfileDocument(rest[0]!);
			console.log(JSON.stringify(doc, null, json ? 2 : 0));
			return CliExit.ok;
		} catch {
			console.error(`Unknown profile: ${rest[0]}`);
			return CliExit.findings;
		}
	}
	console.error("Usage: profiles list | profiles show <id>");
	return CliExit.usage;
}
