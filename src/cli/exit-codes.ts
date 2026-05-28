/** Unified CLI exit codes (aligned with audit subcommands where applicable). */
export const CliExit = {
	ok: 0,
	findings: 1,
	usage: 2,
	internal: 2,
} as const;

export type CliExitCode = (typeof CliExit)[keyof typeof CliExit];
