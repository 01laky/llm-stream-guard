/** Static audit finding severity. */
export type AuditSeverity = "error" | "warning";

/** Drift finding from policy vs manifest comparison. */
export type DriftFinding = {
	code: "DRIFT_ALLOW" | "DRIFT_DENY" | "DRIFT_POLICY_ONLY";
	severity: AuditSeverity;
	tool: string;
	file: string;
	line?: number;
	message: string;
	policy?: string;
};

/** Dangerous pattern or blockToolArgs static match in manifest text. */
export type StaticPatternFinding = {
	code: string;
	severity: AuditSeverity;
	file: string;
	field: string;
	line?: number;
	message: string;
	policy?: string;
};

/** Combined static audit report (audit static --json). */
export type StaticScanReport = {
	summary: {
		manifests: number;
		toolsDeclared: number;
		drift: number;
		dangerous: number;
		blockToolArgs: number;
		policyVersion?: string;
		mode: string;
	};
	drift: DriftFinding[];
	dangerous: StaticPatternFinding[];
	blockToolArgs: StaticPatternFinding[];
};

/** Parsed manifest with tool names and scannable string fields. */
export type ParsedManifest = {
	file: string;
	tools: string[];
	strings: Array<{ field: string; value: string; line?: number }>;
};
