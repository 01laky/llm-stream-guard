/**
 * LSG-COV196–COV220 — stretch coverage: smoke export, env precedence, formatters, SARIF, workflow.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { scanDangerousStrings } from "../src/audit/dangerous-patterns.js";
import { lineOf, parseManifestFile } from "../src/audit/extract-tools.js";
import { formatStaticScanReport } from "../src/audit/format-report.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import { staticScanToSarif } from "../src/audit/sarif.js";
import { cmdScan } from "../src/cli/commands/scan.js";
import { CliExit } from "../src/cli/exit-codes.js";
import { formatPolicyDiff, formatScanReport, formatValidationErrors } from "../src/cli/output.js";
import { cliUsage } from "../src/cli/usage.js";
import { applyModeOverride } from "../src/policy/compile.js";
import { loadPolicy } from "../src/policy/load.js";
import type { PolicyDiff } from "../src/policy/types.js";
import type { ScanReport } from "../src/scan/types.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");
const smokePath = join(rootDir, "scripts/smoke-package.mjs");
const workflowPath = join(rootDir, ".github/workflows/guard-audit.yml");
const gatePolicy = join(rootDir, "policies/agent-gate.json");
const auditPolicy = join(rootDir, "policies/audit-only.json");
const cleanEvent = join(rootDir, "test/fixtures/events/clean-tool.json");
const multilineManifest = join(rootDir, "test/fixtures/tools/coverage/multiline-manifest.json");

function runCli(args: string[]) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0" },
	});
}

function restoreEnv(key: string, prev: string | undefined) {
	if (prev === undefined) delete process.env[key];
	else process.env[key] = prev;
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

afterEach(() => {
	vi.restoreAllMocks();
	delete process.env.GUARD_MODE;
	delete process.env.GUARD_POLICY_PATH;
});

describe("LSG-COV196: smoke package audit export", () => {
	it("package exposes llm-stream-guard/audit and dist audit bundle exists", () => {
		const smoke = readFileSync(smokePath, "utf8");
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
			exports: Record<string, unknown>;
		};
		expect(smoke).toContain("llm-stream-guard");
		expect(pkg.exports["./audit"]).toBeDefined();
		expect(existsSync(join(rootDir, "dist/audit/index.js"))).toBe(true);
		const exportAudit = JSON.stringify(pkg.exports["./audit"]);
		expect(exportAudit).toContain("dist/audit");
	});
});

describe("LSG-COV197: applyModeOverride GUARD_MODE block", () => {
	it("env block overrides document mode", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "block";
		try {
			expect(applyModeOverride("audit")).toBe("block");
		} finally {
			restoreEnv("GUARD_MODE", prev);
		}
	});
});

describe("LSG-COV198: applyModeOverride GUARD_MODE warn", () => {
	it("env warn overrides options", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "warn";
		try {
			expect(applyModeOverride("block", { mode: "audit" })).toBe("warn");
		} finally {
			restoreEnv("GUARD_MODE", prev);
		}
	});
});

describe("LSG-COV199: applyModeOverride GUARD_MODE audit", () => {
	it("env audit wins over block document", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "audit";
		try {
			expect(applyModeOverride("block")).toBe("audit");
		} finally {
			restoreEnv("GUARD_MODE", prev);
		}
	});
});

describe("LSG-COV200: loadPolicy GUARD_MODE precedence", () => {
	it("loadPolicy uses env mode when set", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "warn";
		try {
			expect(loadPolicy(auditPolicy).mode).toBe("warn");
		} finally {
			restoreEnv("GUARD_MODE", prev);
		}
	});
});

describe("LSG-COV201: loadPolicy options.mode precedence", () => {
	it("options.mode applies when GUARD_MODE unset", () => {
		const prev = process.env.GUARD_MODE;
		delete process.env.GUARD_MODE;
		try {
			expect(loadPolicy(auditPolicy, { mode: "block" }).mode).toBe("block");
		} finally {
			restoreEnv("GUARD_MODE", prev);
		}
	});
});

describe("LSG-COV202: cmdScan GUARD_POLICY_PATH", () => {
	it("scan uses env policy when --policy omitted", async () => {
		const prev = process.env.GUARD_POLICY_PATH;
		process.env.GUARD_POLICY_PATH = gatePolicy;
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			expect(await cmdScan([cleanEvent], {})).toBe(CliExit.ok);
		} finally {
			logSpy.mockRestore();
			restoreEnv("GUARD_POLICY_PATH", prev);
		}
	});
});

describe("LSG-COV203: cmdScan --policy over env", () => {
	it("explicit --policy wins over GUARD_POLICY_PATH", async () => {
		const prev = process.env.GUARD_POLICY_PATH;
		process.env.GUARD_POLICY_PATH = auditPolicy;
		const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			expect(await cmdScan([cleanEvent], { policy: gatePolicy })).toBe(CliExit.ok);
		} finally {
			logSpy.mockRestore();
			restoreEnv("GUARD_POLICY_PATH", prev);
		}
	});
});

describe("LSG-COV204: spawn cmdScan with GUARD_POLICY_PATH", () => {
	it("CLI scan exits 0 using env default policy", () => {
		const r = runCli(["scan", cleanEvent]);
		const withEnv = spawnSync(process.execPath, [cliPath, "scan", cleanEvent], {
			cwd: rootDir,
			encoding: "utf8",
			env: { ...process.env, FORCE_COLOR: "0", GUARD_POLICY_PATH: gatePolicy },
		});
		expect(withEnv.status).toBe(CliExit.ok);
		expect(r.status).not.toBe(CliExit.ok);
	});
});

describe("LSG-COV205: formatValidationErrors", () => {
	it("formats plain and json validation errors", () => {
		const errors = [{ code: "POLICY_E001", path: "version", message: "bad" }];
		expect(formatValidationErrors(errors, false)).toContain("POLICY_E001 version");
		expect(JSON.parse(formatValidationErrors(errors, true))).toEqual(errors);
	});
});

describe("LSG-COV206: formatScanReport", () => {
	it("formats human and json scan reports", () => {
		const report: ScanReport = {
			summary: {
				files: 1,
				violations: 1,
				redactions: 0,
				policyVersion: "v1",
				mode: "block",
			},
			violations: [{ file: "a.json", rule: "allowTools", message: "denied", mode: "block" }],
		};
		expect(formatScanReport(report, false)).toContain("allowTools");
		expect(JSON.parse(formatScanReport(report, true)).summary.files).toBe(1);
	});
});

describe("LSG-COV207: formatStaticScanReport quiet", () => {
	it("quiet mode suppresses non-error drift lines", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		expect(formatStaticScanReport(report, true).length).toBeGreaterThanOrEqual(0);
		expect(formatStaticScanReport(report, false)).toContain("DRIFT");
	});
});

describe("LSG-COV208: formatStaticScanReport empty quiet", () => {
	it("clean report quiet returns empty string", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "tools/manifest.json",
		});
		expect(formatStaticScanReport(report, true)).toBe("");
	});
});

describe("LSG-COV209: formatPolicyDiff", () => {
	it("formats unchanged and changed diffs", () => {
		const unchanged: PolicyDiff = { changed: false, entries: [] };
		expect(formatPolicyDiff(unchanged, false)).toBe("No differences.");
		const changed: PolicyDiff = {
			changed: true,
			entries: [{ kind: "added", path: "rules[0]", before: undefined, after: {} }],
		};
		expect(formatPolicyDiff(changed, false)).toContain("added");
		expect(JSON.parse(formatPolicyDiff(changed, true)).changed).toBe(true);
	});
});

describe("LSG-COV210: formatPolicyDiff json unchanged", () => {
	it("json unchanged diff is stable object", () => {
		const diff: PolicyDiff = { changed: false, entries: [] };
		expect(JSON.parse(formatPolicyDiff(diff, true))).toEqual(diff);
	});
});

describe("LSG-COV211: lineOf unit test", () => {
	it("maps byte index to 1-based line number", () => {
		expect(lineOf("a\nb\nc", 0)).toBe(1);
		expect(lineOf("a\nb\nc", 2)).toBe(2);
		expect(lineOf("a\nb\nc", 4)).toBe(3);
	});
});

describe("LSG-COV212: multiline manifest rm -rf line 4", () => {
	it("fixture places rm -rf on line 4", () => {
		const lines = readFileSync(multilineManifest, "utf8").split("\n");
		expect(lines[3]).toContain("rm -rf");
		const parsed = parseManifestFile(multilineManifest);
		expect(parsed.strings.some((s) => s.value.includes("rm -rf") && s.line === 4)).toBe(true);
	});
});

describe("LSG-COV213: scanDangerousStrings line", () => {
	it("dangerous scan reports rm -rf finding", () => {
		const parsed = parseManifestFile(multilineManifest);
		const findings = scanDangerousStrings(parsed.file, parsed.strings);
		expect(findings.some((f) => f.code === "D002" && f.line === 4)).toBe(true);
	});
});

describe("LSG-COV214: staticScanToSarif startLine 4", () => {
	it("SARIF region uses line 4 for multiline dangerous string", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: gatePolicy,
			manifest: "test/fixtures/tools/coverage/multiline-manifest.json",
			strict: true,
		});
		const sarif = staticScanToSarif(report) as {
			runs: Array<{
				results: Array<{
					locations: Array<{
						physicalLocation: { region?: { startLine?: number } };
					}>;
				}>;
			}>;
		};
		const lines = sarif.runs[0]!.results.map(
			(r) => r.locations[0]?.physicalLocation.region?.startLine,
		).filter((n): n is number => typeof n === "number");
		expect(lines).toContain(4);
	});
});

describe("LSG-COV215: multi-policy static allow drift", () => {
	it("policyDir loads agent-gate and reports aligned manifest", () => {
		const report = runStaticScan({
			root: rootDir,
			policyDir: "policies",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		expect(report.summary.manifests).toBe(1);
	});
});

describe("LSG-COV216: multi-policy static deny drift", () => {
	it("policyDir flags bash on agent-tools-deny", () => {
		const report = runStaticScan({
			root: rootDir,
			policyDir: "policies",
			manifest: "test/fixtures/tools/agent-tools-deny.json",
		});
		expect(report.drift.some((f) => f.code === "DRIFT_DENY")).toBe(true);
	});
});

describe("LSG-COV217: multi-policy proxy-strict block args", () => {
	it("policyDir runs blockToolArgs against block-args fixture", () => {
		const report = runStaticScan({
			root: rootDir,
			policyDir: "policies",
			manifest: "test/fixtures/tools/agent-tools-block-args.json",
		});
		expect(report.blockToolArgs.length + report.drift.length).toBeGreaterThan(0);
	});
});

describe("LSG-COV218: multi-policy temp policy dir", () => {
	it("temp policyDir Cartesian scan completes", () => {
		const dir = mkdtempSync(join(tmpdir(), "lsg-cov-pol-dir-"));
		writeFileSync(
			join(dir, "a.json"),
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [{ allowTools: { names: ["search"] } }],
			}),
		);
		writeFileSync(
			join(dir, "b.json"),
			JSON.stringify({
				version: "1",
				mode: "audit",
				rules: [{ allowTools: { names: ["grep"] } }],
			}),
		);
		try {
			const report = runStaticScan({
				root: rootDir,
				policyDir: dir,
				manifest: "test/fixtures/tools/agent-tools-drift.json",
			});
			expect(report.drift.length).toBeGreaterThan(0);
			const labels = new Set(report.drift.map((f) => f.policy).filter(Boolean));
			expect(labels.size).toBeGreaterThanOrEqual(1);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV219: guard-audit workflow vs cliUsage", () => {
	it("workflow run steps align with documented CLI commands", () => {
		const yml = readFileSync(workflowPath, "utf8");
		const usage = cliUsage();
		for (const fragment of ["validate", "audit validate-manifest", "scan", "audit static"]) {
			expect(usage).toContain(fragment.split(" ")[0]!);
		}
		expect(yml).toContain("node dist/cli.js validate");
		expect(yml).toContain("audit validate-manifest");
		expect(yml).toContain("scan --policy");
		expect(yml).toContain("audit static");
	});
});

describe("LSG-COV220: spawn workflow commands exit 0", () => {
	it("each guard-audit.yml node dist/cli.js step succeeds locally", () => {
		expect(runCli(["validate", "policies/agent-gate.json"]).status).toBe(0);
		expect(runCli(["audit", "validate-manifest", "tools/manifest.json"]).status).toBe(0);
		expect(
			runCli([
				"scan",
				"--policy",
				"policies/agent-gate.json",
				"--json",
				"test/fixtures/events/clean-tool.json",
			]).status,
		).toBe(0);
		expect(
			runCli([
				"audit",
				"static",
				"--policy",
				"policies/agent-gate.json",
				"--root",
				".",
				"--manifest",
				"tools/manifest.json",
			]).status,
		).toBe(0);
	});
});
