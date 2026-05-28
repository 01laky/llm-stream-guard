export type ParsedArgs = {
	flags: Record<string, string | boolean>;
	rest: string[];
};

/** Parse `--key value` and boolean flags from argv (shared by CLI and audit runner). */
export function parseArgs(argv: string[]): ParsedArgs {
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

/** Split comma-separated CLI list values (e.g. `--include a,b`). */
export function splitCommaList(v: string | boolean | undefined): string[] | undefined {
	if (typeof v !== "string" || v.length === 0) return undefined;
	return v
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
