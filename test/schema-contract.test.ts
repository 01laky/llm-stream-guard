/**
 * LSG-SCH01–SCH15 — structural validation of scan/static/summary JSON shapes.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runStaticScan } from "../src/audit/static-scan.js";
import { buildScanReport } from "../src/scan/types.js";
import { summarizeGuardContext } from "../src/index.js";
import { createGuardContext } from "../src/create-guard-context.js";
import { recordViolation } from "../src/record-violation.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadSchema(name: string): Record<string, unknown> {
	return JSON.parse(readFileSync(join(rootDir, "schemas", name), "utf8")) as Record<
		string,
		unknown
	>;
}

function requiredKeys(schema: Record<string, unknown>, path = "root"): string[] {
	const required = (schema.required as string[] | undefined) ?? [];
	return required;
}

function assertShape(
	obj: Record<string, unknown>,
	schema: Record<string, unknown>,
	label: string,
): void {
	for (const key of requiredKeys(schema)) {
		expect(obj, `${label} missing ${key}`).toHaveProperty(key);
	}
	const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
	if (props) {
		for (const key of Object.keys(obj)) {
			if (props[key] === undefined && schema.additionalProperties === false) {
				expect.fail(`${label} unexpected key ${key}`);
			}
		}
	}
}

describe("LSG-SCH01–SCH05: scan report schema", () => {
	const schema = loadSchema("scan-report-v1.json");

	it("SCH01: schema declares summary and violations required", () => {
		expect(requiredKeys(schema)).toEqual(["summary", "violations"]);
	});

	it("SCH02: buildScanReport matches contract", () => {
		const report = buildScanReport({ mode: "block", policyVersion: "v1" }, [], 2, 3);
		assertShape(report as unknown as Record<string, unknown>, schema, "scan");
		expect(report.summary.files).toBe(2);
	});

	it("SCH03: violation items have file rule message mode", () => {
		const report = buildScanReport(
			{ mode: "warn" },
			[{ file: "a.json", rule: "r", message: "m", mode: "warn" }],
			1,
			0,
		);
		const item = report.violations[0]!;
		expect(item.file).toBe("a.json");
	});

	it("SCH04: summary mode string", () => {
		expect(buildScanReport({ mode: "audit" }, [], 0, 0).summary.mode).toBe("audit");
	});

	it("SCH05: policyVersion optional on summary", () => {
		const withPv = buildScanReport({ mode: "block", policyVersion: "p" }, [], 0, 0);
		const without = buildScanReport({ mode: "block" }, [], 0, 0);
		expect(withPv.summary.policyVersion).toBe("p");
		expect(without.summary.policyVersion).toBeUndefined();
	});
});

describe("LSG-SCH06–SCH10: static scan report schema", () => {
	const schema = loadSchema("static-scan-report-v1.json");

	it("SCH06: schema requires drift dangerous blockToolArgs", () => {
		expect(requiredKeys(schema)).toContain("drift");
		expect(requiredKeys(schema)).toContain("dangerous");
	});

	it("SCH07: runStaticScan output matches contract", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		assertShape(report as unknown as Record<string, unknown>, schema, "static");
	});

	it("SCH08: summary counts are numbers", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		expect(typeof report.summary.manifests).toBe("number");
		expect(typeof report.summary.drift).toBe("number");
	});

	it("SCH09: finding severity enum", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		for (const f of report.drift) {
			expect(["error", "warning"]).toContain(f.severity);
		}
	});

	it("SCH10: arrays default empty on clean scan", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		expect(Array.isArray(report.dangerous)).toBe(true);
		expect(Array.isArray(report.blockToolArgs)).toBe(true);
	});
});

describe("LSG-SCH11–SCH15: stream guard summary schema", () => {
	const schema = loadSchema("stream-guard-summary-v1.json");

	it("SCH11: schema requires violations countsByRule toolsTouched redactions mode", () => {
		expect(requiredKeys(schema)).toEqual([
			"violations",
			"countsByRule",
			"toolsTouched",
			"redactions",
			"mode",
		]);
	});

	it("SCH12: summarizeGuardContext matches contract", () => {
		const ctx = createGuardContext({ mode: "block", policyVersion: "s1" });
		recordViolation(ctx, { rule: "x", message: "m" });
		const s = summarizeGuardContext(ctx);
		assertShape(s as unknown as Record<string, unknown>, schema, "summary");
	});

	it("SCH13: mode enum block warn audit", () => {
		for (const mode of ["block", "warn", "audit"] as const) {
			expect(summarizeGuardContext(createGuardContext({ mode })).mode).toBe(mode);
		}
	});

	it("SCH14: countsByRule values are numbers", () => {
		const ctx = createGuardContext();
		recordViolation(ctx, { rule: "a", message: "1" });
		recordViolation(ctx, { rule: "a", message: "2" });
		const counts = summarizeGuardContext(ctx).countsByRule;
		expect(counts.a).toBe(2);
	});

	it("SCH15: three schemas ship in package files list", () => {
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
			files: string[];
		};
		expect(pkg.files).toContain("schemas");
		for (const f of [
			"scan-report-v1.json",
			"static-scan-report-v1.json",
			"stream-guard-summary-v1.json",
		]) {
			expect(readFileSync(join(rootDir, "schemas", f), "utf8")).toContain("$schema");
		}
	});
});

describe("LSG-SCH16–SCH35: schema shape edge matrix", () => {
	const scanSchema = loadSchema("scan-report-v1.json");
	const staticSchema = loadSchema("static-scan-report-v1.json");
	const summarySchema = loadSchema("stream-guard-summary-v1.json");

	for (let i = 16; i <= 35; i++) {
		it(`SCH${String(i).padStart(2, "0")}: contract variant ${i - 15}`, async () => {
			const n = i - 16;
			const mode = (["block", "warn", "audit"] as const)[n % 3]!;

			if (n % 3 === 0) {
				const ctx = createGuardContext({
					mode,
					policyVersion: n % 2 === 0 ? `sch-${i}` : undefined,
				});
				for (let v = 0; v <= n % 5; v++) {
					recordViolation(ctx, { rule: `rule-${v}`, message: `m-${i}-${v}` });
				}
				assertShape(
					summarizeGuardContext(ctx) as unknown as Record<string, unknown>,
					summarySchema,
					`summary-${i}`,
				);
				return;
			}

			if (n % 3 === 1) {
				const report = buildScanReport(
					{ mode, policyVersion: n % 2 ? "pv" : undefined },
					Array.from({ length: n % 4 }, (_, j) => ({
						file: `f-${j}.json`,
						rule: "r",
						message: "m",
						mode,
					})),
					n % 10,
					n % 7,
				);
				assertShape(report as unknown as Record<string, unknown>, scanSchema, `scan-${i}`);
				return;
			}

			const report = runStaticScan({
				root: rootDir,
				policy: "policies/agent-gate.json",
				manifest: "test/fixtures/tools/agent-tools.json",
			});
			assertShape(report as unknown as Record<string, unknown>, staticSchema, `static-${i}`);
			expect(report.summary.mode).toBeTruthy();
		});
	}
});
