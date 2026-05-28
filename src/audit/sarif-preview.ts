import { PACKAGE_VERSION } from "../version.js";
import type { DriftFinding, StaticPatternFinding, StaticScanReport } from "./types.js";

type SarifResult = {
	ruleId: string;
	level: "error" | "warning" | "note";
	message: { text: string };
	locations: Array<{
		physicalLocation: {
			artifactLocation: { uri: string };
			region?: { startLine?: number };
		};
	}>;
};

function findingToResult(f: DriftFinding | StaticPatternFinding): SarifResult {
	return {
		ruleId: f.code,
		level: f.severity,
		message: { text: f.message },
		locations: [
			{
				physicalLocation: {
					artifactLocation: { uri: f.file },
					...(f.line ? { region: { startLine: f.line } } : {}),
				},
			},
		],
	};
}

/** Build SARIF 2.1.0 preview document from static scan report. */
export function staticScanToSarif(report: StaticScanReport): Record<string, unknown> {
	const results: SarifResult[] = [
		...report.drift.map(findingToResult),
		...report.dangerous.map(findingToResult),
		...report.blockToolArgs.map(findingToResult),
	];
	return {
		$schema:
			"https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-2.1.0.json",
		version: "2.1.0",
		runs: [
			{
				tool: {
					driver: {
						name: "llm-stream-guard",
						version: report.summary.policyVersion ?? PACKAGE_VERSION,
						rules: [],
					},
				},
				results,
			},
		],
	};
}
