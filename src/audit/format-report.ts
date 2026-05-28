import type { DriftFinding, StaticScanReport } from "./types.js";

/** Format human-readable static scan output. */
export function formatStaticScanReport(report: StaticScanReport, quiet: boolean): string {
	const lines: string[] = [];
	if (!quiet) {
		lines.push(
			`Static audit: ${report.summary.manifests} manifest(s), ${report.summary.toolsDeclared} tool(s)`,
		);
	}
	const findings = [...report.drift, ...report.dangerous, ...report.blockToolArgs];
	if (findings.length === 0) {
		if (!quiet) lines.push("No findings.");
		return lines.join("\n");
	}
	for (const f of report.drift) {
		if (quiet && f.severity !== "error") continue;
		if ("tool" in f) {
			lines.push(`[${f.severity}] ${f.code} ${f.tool} @ ${f.file}: ${f.message}`);
		}
	}
	for (const f of report.dangerous) {
		if (quiet && f.severity !== "error") continue;
		lines.push(`[${f.severity}] ${f.code} ${f.field} @ ${f.file}: ${f.message}`);
	}
	for (const f of report.blockToolArgs) {
		if (quiet && f.severity !== "error") continue;
		lines.push(`[${f.severity}] ${f.code} ${f.field} @ ${f.file}: ${f.message}`);
	}
	return lines.join("\n");
}

/** Count error-severity findings (for exit code / strict). */
export function countStaticErrors(report: StaticScanReport, strict: boolean): number {
	let n = report.drift.filter((f) => f.severity === "error").length;
	n += report.blockToolArgs.filter((f) => f.severity === "error").length;
	if (strict) {
		n += report.dangerous.length;
	}
	return n;
}

function applyStrict(drift: DriftFinding[], strict: boolean): DriftFinding[] {
	if (!strict) return drift;
	return drift.map((f) =>
		f.code === "DRIFT_POLICY_ONLY" ? { ...f, severity: "error" as const } : f,
	);
}

export { applyStrict };
