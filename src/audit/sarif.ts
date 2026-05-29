import { PACKAGE_VERSION } from "../version.js";
import { DANGEROUS_PATTERNS } from "./dangerous-patterns.js";
import type { DriftFinding, StaticPatternFinding, StaticScanReport } from "./types.js";

const DOCS_BASE = "https://github.com/01laky/llm-stream-guard/blob/main/docs/static-scanning.md";

type SarifRule = {
	id: string;
	name: string;
	shortDescription: { text: string };
	fullDescription: { text: string };
	helpUri: string;
	defaultConfiguration: { level: "error" | "warning" | "note" };
};

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

const DRIFT_RULES: SarifRule[] = [
	{
		id: "DRIFT_ALLOW",
		name: "DriftAllow",
		shortDescription: { text: "Manifest tool not in policy allowTools" },
		fullDescription: {
			text: "A tool declared in the manifest is not listed in policy allowTools.",
		},
		helpUri: `${DOCS_BASE}#drift-detection`,
		defaultConfiguration: { level: "error" },
	},
	{
		id: "DRIFT_DENY",
		name: "DriftDeny",
		shortDescription: { text: "Denied tool declared in manifest" },
		fullDescription: { text: "A tool is declared in the manifest but denied by policy." },
		helpUri: `${DOCS_BASE}#drift-detection`,
		defaultConfiguration: { level: "error" },
	},
	{
		id: "DRIFT_POLICY_ONLY",
		name: "DriftPolicyOnly",
		shortDescription: { text: "Policy allowTools entry missing from manifest" },
		fullDescription: {
			text: "Policy allowTools lists a tool that does not appear in the manifest.",
		},
		helpUri: `${DOCS_BASE}#drift-detection`,
		defaultConfiguration: { level: "warning" },
	},
];

const BLOCK_ARGS_RULE: SarifRule = {
	id: "BLOCK_ARGS_STATIC",
	name: "BlockArgsStatic",
	shortDescription: { text: "Static blockToolArgs pattern in manifest text" },
	fullDescription: {
		text: "Manifest string field matches a policy blockToolArgs static analysis rule.",
	},
	helpUri: `${DOCS_BASE}#blocktoolargs-static-analysis`,
	defaultConfiguration: { level: "warning" },
};

function dangerousRules(): SarifRule[] {
	return DANGEROUS_PATTERNS.map((p) => ({
		id: p.id,
		name: p.id,
		shortDescription: { text: p.message },
		fullDescription: { text: p.message },
		helpUri: `${DOCS_BASE}#dangerous-pattern-catalog-d001d006`,
		defaultConfiguration: { level: "warning" as const },
	}));
}

export const SARIF_RULE_CATALOG: SarifRule[] = [
	...DRIFT_RULES,
	...dangerousRules(),
	BLOCK_ARGS_RULE,
];

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

function rulesForResults(results: SarifResult[]): SarifRule[] {
	const ids = new Set(results.map((r) => r.ruleId));
	return SARIF_RULE_CATALOG.filter((r) => ids.has(r.id));
}

/** Build SARIF 2.1.0 document from static scan report (stable 1.x rule IDs). */
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
						rules: rulesForResults(results),
					},
				},
				results,
			},
		],
	};
}
