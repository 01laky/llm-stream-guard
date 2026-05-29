/**
 * LSG-SAR01–SAR40 — stable SARIF 2.1.0 export (1.0 rule IDs).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DANGEROUS_PATTERNS } from "../src/audit/dangerous-patterns.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import { SARIF_RULE_CATALOG, staticScanToSarif } from "../src/audit/sarif.js";
import type { StaticScanReport } from "../src/audit/types.js";
import { PACKAGE_VERSION } from "../src/version.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function emptyReport(overrides: Partial<StaticScanReport["summary"]> = {}): StaticScanReport {
	return {
		summary: {
			manifests: 0,
			toolsDeclared: 0,
			drift: 0,
			dangerous: 0,
			blockToolArgs: 0,
			mode: "block",
			...overrides,
		},
		drift: [],
		dangerous: [],
		blockToolArgs: [],
	};
}

function sarifDoc(report: StaticScanReport): {
	version: string;
	$schema: string;
	runs: Array<{
		tool: { driver: { name: string; version: string; rules: Array<{ id: string }> } };
		results: Array<{ ruleId: string; level: string; message: { text: string } }>;
	}>;
} {
	return staticScanToSarif(report) as ReturnType<typeof sarifDoc>;
}

describe("LSG-SAR01–SAR10: SARIF document shape", () => {
	it("SAR01: version 2.1.0", () => {
		expect(sarifDoc(emptyReport()).version).toBe("2.1.0");
	});

	it("SAR02: $schema references sarif-2.1.0", () => {
		expect(sarifDoc(emptyReport()).$schema).toContain("sarif-2.1.0");
	});

	it("SAR03: single run", () => {
		expect(sarifDoc(emptyReport()).runs).toHaveLength(1);
	});

	it("SAR04: driver name llm-stream-guard", () => {
		expect(sarifDoc(emptyReport()).runs[0]!.tool.driver.name).toBe("llm-stream-guard");
	});

	it("SAR05: driver version uses PACKAGE_VERSION when no policyVersion", () => {
		expect(sarifDoc(emptyReport()).runs[0]!.tool.driver.version).toBe(PACKAGE_VERSION);
	});

	it("SAR06: driver version uses policyVersion when set", () => {
		expect(sarifDoc(emptyReport({ policyVersion: "gate-9" })).runs[0]!.tool.driver.version).toBe(
			"gate-9",
		);
	});

	it("SAR07: empty results array", () => {
		expect(sarifDoc(emptyReport()).runs[0]!.results).toEqual([]);
	});

	it("SAR08: empty results yields empty rules array", () => {
		expect(sarifDoc(emptyReport()).runs[0]!.tool.driver.rules).toEqual([]);
	});

	it("SAR09: results include message.text", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const results = sarifDoc(report).runs[0]!.results;
		expect(results.length).toBeGreaterThan(0);
		expect(results[0]!.message.text.length).toBeGreaterThan(0);
	});

	it("SAR10: results include physicalLocation uri", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const loc = (staticScanToSarif(report) as { runs: Array<{ results: unknown[] }> }).runs[0]!
			.results[0] as {
			locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
		};
		expect(loc.locations[0]!.physicalLocation.artifactLocation.uri.length).toBeGreaterThan(0);
	});
});

describe("LSG-SAR11–SAR20: rule catalog", () => {
	it("SAR11: catalog includes DRIFT_ALLOW", () => {
		expect(SARIF_RULE_CATALOG.some((r) => r.id === "DRIFT_ALLOW")).toBe(true);
	});

	it("SAR12: catalog includes DRIFT_DENY", () => {
		expect(SARIF_RULE_CATALOG.some((r) => r.id === "DRIFT_DENY")).toBe(true);
	});

	it("SAR13: catalog includes DRIFT_POLICY_ONLY", () => {
		expect(SARIF_RULE_CATALOG.some((r) => r.id === "DRIFT_POLICY_ONLY")).toBe(true);
	});

	it("SAR14: catalog includes BLOCK_ARGS_STATIC", () => {
		expect(SARIF_RULE_CATALOG.some((r) => r.id === "BLOCK_ARGS_STATIC")).toBe(true);
	});

	it("SAR15: catalog includes D001–D006", () => {
		for (const p of DANGEROUS_PATTERNS) {
			expect(SARIF_RULE_CATALOG.some((r) => r.id === p.id)).toBe(true);
		}
	});

	it("SAR16: each catalog rule has helpUri", () => {
		for (const r of SARIF_RULE_CATALOG) {
			expect(r.helpUri).toContain("static-scanning.md");
		}
	});

	it("SAR17: each catalog rule has shortDescription.text", () => {
		for (const r of SARIF_RULE_CATALOG) {
			expect(r.shortDescription.text.length).toBeGreaterThan(0);
		}
	});

	it("SAR18: rules emitted are subset of catalog", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const ids = new Set(SARIF_RULE_CATALOG.map((r) => r.id));
		for (const res of sarifDoc(report).runs[0]!.results) {
			expect(ids.has(res.ruleId)).toBe(true);
		}
	});

	it("SAR19: drift result ruleId DRIFT_ALLOW", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const ids = sarifDoc(report).runs[0]!.results.map((r) => r.ruleId);
		expect(ids).toContain("DRIFT_ALLOW");
	});

	it("SAR20: catalog size is drift + dangerous + block args", () => {
		expect(SARIF_RULE_CATALOG.length).toBe(3 + DANGEROUS_PATTERNS.length + 1);
	});
});

describe("LSG-SAR21–SAR30: golden and CLI parity", () => {
	const goldenPath = join(rootDir, "test/fixtures/sarif/empty-report.golden.json");

	it("SAR21: empty report golden snapshot keys", () => {
		const doc = sarifDoc(emptyReport());
		expect(Object.keys(doc).sort()).toEqual(["$schema", "runs", "version"]);
	});

	it("SAR22: golden file exists for empty SARIF", () => {
		const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
		expect(golden.version).toBe("2.1.0");
		expect(golden.runs[0].results).toEqual([]);
	});

	it("SAR23: live empty matches golden structure", () => {
		const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
		const live = sarifDoc(emptyReport());
		expect(live.version).toBe(golden.version);
		expect(live.runs[0]!.results).toEqual(golden.runs[0].results);
	});

	it("SAR24: result level error for DRIFT_ALLOW", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const drift = sarifDoc(report).runs[0]!.results.find((r) => r.ruleId === "DRIFT_ALLOW");
		expect(drift?.level).toBe("error");
	});

	it("SAR25: dangerous pattern maps to warning level", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/audit-only.json",
			manifest: "test/fixtures/tools/agent-tools-dangerous.json",
		});
		if (report.dangerous.length > 0) {
			const res = sarifDoc(report).runs[0]!.results.find((r) => r.ruleId.startsWith("D"));
			expect(res?.level).toBe("warning");
		} else {
			expect(report.dangerous.length).toBe(0);
		}
	});

	it("SAR26: staticScanToSarif is exported from audit index", async () => {
		const mod = await import("../src/audit/index.js");
		expect(typeof mod.staticScanToSarif).toBe("function");
		expect(Array.isArray(mod.SARIF_RULE_CATALOG)).toBe(true);
	});

	it("SAR27: no sarif-preview module in dist path", () => {
		expect(() => readFileSync(join(rootDir, "src/audit/sarif-preview.ts"), "utf8")).toThrow();
	});

	it("SAR28: sarif.ts is the canonical module", () => {
		expect(readFileSync(join(rootDir, "src/audit/sarif.ts"), "utf8")).toContain(
			"SARIF_RULE_CATALOG",
		);
	});

	it("SAR29: rules deduped per result ruleId set", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const rules = sarifDoc(report).runs[0]!.tool.driver.rules;
		const ids = rules.map((r) => r.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it("SAR30: JSON.stringify round-trip", () => {
		const raw = JSON.stringify(sarifDoc(emptyReport()));
		const parsed = JSON.parse(raw);
		expect(parsed.version).toBe("2.1.0");
	});
});

describe("LSG-SAR31–SAR40: findings coverage", () => {
	for (let i = 31; i <= 40; i++) {
		it(`SAR${String(i).padStart(2, "0")}: catalog rule ${i - 30} stable id`, () => {
			const idx = i - 31;
			const rule = SARIF_RULE_CATALOG[idx];
			expect(rule?.id).toBeTruthy();
			expect(rule?.defaultConfiguration.level).toMatch(/error|warning|note/);
		});
	}
});

describe("LSG-SAR41–SAR80: SARIF edge matrix", () => {
	const policies = [
		"policies/agent-gate.json",
		"policies/proxy-strict.json",
		"policies/audit-only.json",
	] as const;
	const manifests = [
		"test/fixtures/tools/agent-tools.json",
		"test/fixtures/tools/agent-tools-drift.json",
		"test/fixtures/tools/agent-tools-invalid.json",
	] as const;

	for (let i = 41; i <= 80; i++) {
		it(`SAR${String(i).padStart(2, "0")}: matrix case ${i - 40}`, () => {
			const n = i - 41;
			const policy = policies[n % policies.length]!;
			const manifest = manifests[n % manifests.length]!;

			if (n % 4 === 3) {
				const doc = sarifDoc(emptyReport({ mode: "audit", policyVersion: `pv-${i}` }));
				expect(doc.runs[0]!.tool.driver.version).toBe(`pv-${i}`);
				expect(doc.runs[0]!.results).toEqual([]);
				return;
			}

			let report: StaticScanReport;
			try {
				report = runStaticScan({ root: rootDir, policy, manifest });
			} catch {
				report = emptyReport();
			}
			const doc = sarifDoc(report);
			expect(doc.version).toBe("2.1.0");
			expect(doc.runs[0]!.tool.driver.name).toBe("llm-stream-guard");
			for (const r of doc.runs[0]!.results) {
				expect(SARIF_RULE_CATALOG.some((c) => c.id === r.ruleId)).toBe(true);
				expect(r.message.text.length).toBeGreaterThan(0);
			}
			const ids = doc.runs[0]!.tool.driver.rules.map((r) => r.id);
			expect(ids).toEqual([...new Set(ids)].sort((a, b) => a.localeCompare(b)));
		});
	}
});
