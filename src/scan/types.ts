import type { Violation } from "../types.js";

export type ScanViolation = {
	file: string;
	rule: string;
	message: string;
	mode: string;
	policyVersion?: string;
};

export type ScanReport = {
	summary: {
		files: number;
		violations: number;
		redactions: number;
		policyVersion?: string;
		mode: string;
	};
	violations: ScanViolation[];
};

export function violationToScan(
	file: string,
	v: Violation,
	policyVersion: string | undefined,
): ScanViolation {
	return {
		file,
		rule: v.rule,
		message: v.message,
		mode: v.mode,
		...(policyVersion !== undefined ? { policyVersion } : {}),
	};
}

export function buildScanReport(
	policy: { mode: string; policyVersion?: string },
	violations: ScanViolation[],
	files: number,
	redactions: number,
): ScanReport {
	return {
		summary: {
			files,
			violations: violations.length,
			redactions,
			...(policy.policyVersion ? { policyVersion: policy.policyVersion } : {}),
			mode: policy.mode,
		},
		violations,
	};
}
