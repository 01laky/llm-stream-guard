import { parseArgs } from "../shared/parse-args.js";
import { runAuditSubcommand } from "./audit-runner.js";
import { cmdDoctor } from "./commands/doctor.js";
import { cmdDiff } from "./commands/diff.js";
import { cmdProfiles } from "./commands/profiles.js";
import { cmdResolve } from "./commands/resolve.js";
import { cmdScan } from "./commands/scan.js";
import { cmdValidate } from "./commands/validate.js";
import { CliExit } from "./exit-codes.js";
import { cliUsage } from "./usage.js";

async function main(): Promise<number> {
	const argv = process.argv.slice(2);
	const { flags, rest } = parseArgs(argv);

	if (flags.help === true || rest.length === 0) {
		console.log(cliUsage());
		return rest.length === 0 ? CliExit.usage : CliExit.ok;
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
		case "doctor":
			return cmdDoctor(cmdRest, json);
		case "audit":
			return runAuditSubcommand(cmdRest[0], flags, cmdRest.slice(1));
		default:
			console.error(`Unknown command: ${cmd}\n${cliUsage()}`);
			return CliExit.usage;
	}
}

main()
	.then((code) => process.exit(code))
	.catch((err) => {
		console.error(err);
		process.exit(CliExit.usage);
	});
