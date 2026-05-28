import type { PolicyValidationError } from "../policy/error-codes.js";
import type { PolicyDiff } from "../policy/types.js";
import type { ScanReport, ScanViolation } from "../scan/types.js";

export type { ScanReport, ScanViolation };

export function formatValidationErrors(errors: PolicyValidationError[], json: boolean): string {
	if (json) return JSON.stringify(errors, null, 2);
	return errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("\n");
}

export function formatScanReport(report: ScanReport, json: boolean): string {
	if (json) return JSON.stringify(report, null, 2);
	const lines = [
		`scan: ${report.summary.files} files, ${report.summary.violations} violations, ${report.summary.redactions} redactions`,
	];
	if (report.summary.policyVersion) {
		lines.unshift(`policy: ${report.summary.policyVersion} (mode ${report.summary.mode})`);
	}
	for (const v of report.violations) {
		lines.push(`  ${v.file}: ${v.rule} — ${v.message}`);
	}
	return lines.join("\n");
}

export function formatPolicyDiff(diff: PolicyDiff, json: boolean): string {
	if (json) return JSON.stringify(diff, null, 2);
	if (!diff.changed) return "No differences.";
	return diff.entries
		.map((e) => `${e.kind} ${e.path}: ${JSON.stringify(e.before)} → ${JSON.stringify(e.after)}`)
		.join("\n");
}

export { violationToScan } from "../scan/types.js";
