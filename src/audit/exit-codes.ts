/** Unified exit codes for audit subcommands (§2.4b). */
export const AuditExit = {
	ok: 0,
	findings: 1,
	usage: 2,
	internal: 3,
} as const;

export type AuditExitCode = (typeof AuditExit)[keyof typeof AuditExit];
