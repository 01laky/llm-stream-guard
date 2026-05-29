/**
 * LSG-COV56–COV80 — exhaustive CLI and audit-runner coverage.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { AuditExit } from "../src/audit/exit-codes.js";
import {
	runAuditDrift,
	runAuditStatic,
	runAuditSubcommand,
	runAuditValidateManifest,
} from "../src/cli/audit-runner.js";
import { cmdDiff } from "../src/cli/commands/diff.js";
import { cmdProfiles } from "../src/cli/commands/profiles.js";
import { cmdResolve } from "../src/cli/commands/resolve.js";
import { cmdScan } from "../src/cli/commands/scan.js";
import { cmdValidate } from "../src/cli/commands/validate.js";
import { CliExit } from "../src/cli/exit-codes.js";
import { formatPolicyDiff, formatScanReport, formatValidationErrors } from "../src/cli/output.js";
import type { PolicyDiff } from "../src/policy/types.js";
import type { ScanReport } from "../src/scan/types.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");
const validPolicy = join(rootDir, "test/fixtures/policies/valid/minimal.json");
const badPolicy = join(rootDir, "test/fixtures/policies/invalid/bad-regexp.json");
const gatePolicy = join(rootDir, "policies/agent-gate.json");
const cleanEvent = join(rootDir, "test/fixtures/events/clean-tool.json");
const badEvent = join(rootDir, "test/fixtures/events/bad-tool.json");
const cleanManifest = join(rootDir, "test/fixtures/tools/agent-tools.json");
const driftManifest = join(rootDir, "test/fixtures/tools/agent-tools-drift.json");

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

function captureConsole() {
	const logs: string[] = [];
	const errors: string[] = [];
	const logSpy = vi.spyOn(console, "log").mockImplementation((...a) => {
		logs.push(a.map(String).join(" "));
	});
	const errSpy = vi.spyOn(console, "error").mockImplementation((...a) => {
		errors.push(a.map(String).join(" "));
	});
	return {
		logs,
		errors,
		restore: () => {
			logSpy.mockRestore();
			errSpy.mockRestore();
		},
	};
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("LSG-COV56: cmdValidate success", () => {
	it("returns ok on valid policy", () => {
		const c = captureConsole();
		expect(cmdValidate([validPolicy], false)).toBe(CliExit.ok);
		c.restore();
	});
});

describe("LSG-COV57: cmdValidate failure", () => {
	it("returns findings on invalid policy", () => {
		const c = captureConsole();
		expect(cmdValidate([badPolicy], false)).toBe(CliExit.findings);
		expect(c.errors.join("\n")).toMatch(/POLICY_E003/);
		c.restore();
	});
});

describe("LSG-COV58: cmdValidate usage", () => {
	it("returns usage without policy path", () => {
		const c = captureConsole();
		expect(cmdValidate([], false)).toBe(CliExit.usage);
		c.restore();
	});
});

describe("LSG-COV59: cmdResolve success", () => {
	it("prints resolved policy JSON", () => {
		const c = captureConsole();
		expect(cmdResolve([join(rootDir, "policies/examples/extends-agent.json")], true)).toBe(
			CliExit.ok,
		);
		const doc = JSON.parse(c.logs[0]!);
		expect(doc.policyVersion).toBe("team-extends-demo");
		c.restore();
	});
});

describe("LSG-COV60: cmdResolve usage", () => {
	it("returns usage when path missing", () => {
		const c = captureConsole();
		expect(cmdResolve([], false)).toBe(CliExit.usage);
		c.restore();
	});
});

describe("LSG-COV61: cmdDiff unchanged", () => {
	it("returns ok when policies identical", () => {
		const c = captureConsole();
		expect(cmdDiff([validPolicy, validPolicy], {})).toBe(CliExit.ok);
		expect(c.logs.join("\n")).toContain("No differences");
		c.restore();
	});
});

describe("LSG-COV62: cmdDiff --check changed", () => {
	it("returns findings when policies differ", () => {
		const c = captureConsole();
		expect(
			cmdDiff([gatePolicy, join(rootDir, "policies/proxy-strict.json")], { check: true }),
		).toBe(CliExit.findings);
		c.restore();
	});
});

describe("LSG-COV63: cmdDiff usage", () => {
	it("returns usage with wrong arity", () => {
		const c = captureConsole();
		expect(cmdDiff([validPolicy], {})).toBe(CliExit.usage);
		c.restore();
	});
});

describe("LSG-COV64: cmdProfiles list", () => {
	it("lists built-in profile ids", () => {
		const c = captureConsole();
		expect(cmdProfiles("list", [], false)).toBe(CliExit.ok);
		expect(c.logs.join("\n")).toMatch(/agent-gate/);
		c.restore();
	});
});

describe("LSG-COV65: cmdProfiles show", () => {
	it("prints agent-gate profile document", () => {
		const c = captureConsole();
		expect(cmdProfiles("show", ["agent-gate"], true)).toBe(CliExit.ok);
		const doc = JSON.parse(c.logs[0]!);
		expect(doc.rules).toBeDefined();
		c.restore();
	});
});

describe("LSG-COV66: cmdProfiles usage and unknown", () => {
	it("returns usage for missing subcommand", () => {
		const c = captureConsole();
		expect(cmdProfiles(undefined, [], false)).toBe(CliExit.usage);
		c.restore();
	});

	it("returns findings for unknown profile", () => {
		const c = captureConsole();
		expect(cmdProfiles("show", ["no-such-profile"], false)).toBe(CliExit.findings);
		c.restore();
	});
});

describe("LSG-COV67: cmdScan clean file", () => {
	it("returns ok on clean fixture", async () => {
		const c = captureConsole();
		expect(await cmdScan([cleanEvent], { policy: gatePolicy })).toBe(CliExit.ok);
		expect(c.logs.join("\n")).toMatch(/0 violations/);
		c.restore();
	});
});

describe("LSG-COV68: cmdScan violation", () => {
	it("returns findings on bad tool event", async () => {
		const c = captureConsole();
		expect(await cmdScan([badEvent], { policy: gatePolicy })).toBe(CliExit.findings);
		expect(c.logs.join("\n")).toMatch(/violation/i);
		c.restore();
	});
});

describe("LSG-COV69: cmdScan missing policy", () => {
	it("returns usage without policy path", async () => {
		const prev = process.env.GUARD_POLICY_PATH;
		delete process.env.GUARD_POLICY_PATH;
		const c = captureConsole();
		expect(await cmdScan([cleanEvent], {})).toBe(CliExit.usage);
		if (prev !== undefined) process.env.GUARD_POLICY_PATH = prev;
		c.restore();
	});
});

describe("LSG-COV70: runAuditValidateManifest", () => {
	it("returns ok for valid manifest", () => {
		const c = captureConsole();
		expect(runAuditValidateManifest(cleanManifest, true)).toBe(AuditExit.ok);
		const parsed = JSON.parse(c.logs[0]!);
		expect(parsed.ok).toBe(true);
		c.restore();
	});
});

describe("LSG-COV71: runAuditDrift", () => {
	it("returns findings on drift manifest", () => {
		const c = captureConsole();
		expect(runAuditDrift({ policy: gatePolicy, manifest: driftManifest }, [])).toBe(
			AuditExit.findings,
		);
		expect(c.logs.join("\n")).toMatch(/DRIFT_ALLOW/);
		c.restore();
	});
});

describe("LSG-COV72: runAuditStatic clean", () => {
	it("returns ok on aligned manifest", () => {
		const c = captureConsole();
		expect(runAuditStatic({ policy: gatePolicy, manifest: cleanManifest, root: rootDir })).toBe(
			AuditExit.ok,
		);
		c.restore();
	});
});

describe("LSG-COV73: runAuditStatic findings", () => {
	it("returns findings on drift manifest", () => {
		const c = captureConsole();
		expect(runAuditStatic({ policy: gatePolicy, manifest: driftManifest, root: rootDir })).toBe(
			AuditExit.findings,
		);
		c.restore();
	});
});

describe("LSG-COV74: runAuditSubcommand routing", () => {
	it("dispatches validate-manifest, drift, static, unknown", () => {
		const c = captureConsole();
		expect(runAuditSubcommand("validate-manifest", {}, [cleanManifest])).toBe(AuditExit.ok);
		expect(runAuditSubcommand("drift", { policy: gatePolicy, manifest: driftManifest }, [])).toBe(
			AuditExit.findings,
		);
		expect(
			runAuditSubcommand(
				"static",
				{ policy: gatePolicy, manifest: cleanManifest, root: rootDir },
				[],
			),
		).toBe(AuditExit.ok);
		expect(runAuditSubcommand("nope", {}, [])).toBe(AuditExit.usage);
		c.restore();
	});
});

describe("LSG-COV75: formatValidationErrors", () => {
	it("formats text and JSON", () => {
		const errors = [{ code: "POLICY_E001", path: "version", message: "bad" }];
		expect(formatValidationErrors(errors, false)).toContain("POLICY_E001");
		expect(JSON.parse(formatValidationErrors(errors, true))).toEqual(errors);
	});
});

describe("LSG-COV76: formatScanReport", () => {
	it("formats text and JSON scan summary", () => {
		const report: ScanReport = {
			summary: { files: 1, violations: 0, redactions: 0, mode: "block", policyVersion: "v1" },
			violations: [],
		};
		expect(formatScanReport(report, false)).toContain("policy: v1");
		expect(JSON.parse(formatScanReport(report, true)).summary.files).toBe(1);
	});
});

describe("LSG-COV77: formatPolicyDiff", () => {
	it("formats unchanged and changed diffs", () => {
		const unchanged: PolicyDiff = { changed: false, entries: [] };
		expect(formatPolicyDiff(unchanged, false)).toBe("No differences.");
		const changed: PolicyDiff = {
			changed: true,
			entries: [{ kind: "changed", path: "mode", before: "audit", after: "block" }],
		};
		expect(formatPolicyDiff(changed, false)).toContain("mode");
		expect(JSON.parse(formatPolicyDiff(changed, true)).changed).toBe(true);
	});
});

describe("LSG-COV78: AuditExit vs CliExit", () => {
	it("aligns ok/findings/usage; internal differs", () => {
		expect(AuditExit.ok).toBe(CliExit.ok);
		expect(AuditExit.findings).toBe(CliExit.findings);
		expect(AuditExit.usage).toBe(CliExit.usage);
		expect(AuditExit.internal).toBe(3);
		expect(CliExit.internal).toBe(2);
	});
});

describe("LSG-COV79: spawn CLI help", () => {
	it("prints validate, scan, audit commands", () => {
		const r = runCli(["--help"]);
		expect(r.stdout).toMatch(/validate|scan|audit/);
	});
});

describe("LSG-COV80: spawn CLI scan and audit static", () => {
	it("scan exits 0 on clean event", () => {
		expect(runCli(["scan", "--policy", gatePolicy, cleanEvent]).status).toBe(CliExit.ok);
	});

	it("audit static exits 1 on drift manifest", () => {
		expect(
			runCli(["audit", "static", "--policy", gatePolicy, "--manifest", driftManifest]).status,
		).toBe(AuditExit.findings);
	});

	it("audit static usage without policy", () => {
		const env = { ...process.env, FORCE_COLOR: "0" };
		delete env.GUARD_POLICY_PATH;
		const r = spawnSync(process.execPath, [cliPath, "audit", "static"], {
			cwd: rootDir,
			encoding: "utf8",
			env,
		});
		expect(r.status).toBe(AuditExit.usage);
	});
});
