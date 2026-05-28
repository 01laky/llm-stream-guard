/**
 * LSG-ACT19+ — extended GitHub Action wrapper edge cases.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const actionRun = join(rootDir, "action/run.mjs");

function runAction(args: string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [actionRun, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/cli.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-ACT19: fail-on violations only", () => {
	it("passes when drift manifest but fail-on is violations and no scan violations", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--scan-paths",
			"test/fixtures/events/clean-tool.json",
			"--fail-on",
			"violations",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT20: fail-on static only", () => {
	it("fails on static findings even when drift fail-on not set", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--fail-on",
			"static",
		]);
		expect(r.status).not.toBe(0);
	});
});

describe("LSG-ACT21: scan-paths violations output", () => {
	it("sets violations count from bad event fixture", () => {
		const outFile = join(tmpdir(), `lsg-act-out-${Date.now()}.txt`);
		const r = runAction(
			[
				"--policy",
				"policies/agent-gate.json",
				"--scan-paths",
				"test/fixtures/events/bad-tool.json",
				"--manifest",
				"tools/manifest.json",
				"--fail-on",
				"none",
			],
			{ GITHUB_OUTPUT: outFile },
		);
		expect(r.status).toBe(0);
		const output = readFileSync(outFile, "utf8");
		expect(output).toMatch(/violations=\d+/);
		expect(output).toMatch(/violations=[1-9]/);
		rmSync(outFile, { force: true });
	});
});

describe("LSG-ACT22: policy-changed output", () => {
	it("writes policy-changed=false when baseline matches", () => {
		const outFile = join(tmpdir(), `lsg-act-base-${Date.now()}.txt`);
		runAction(
			[
				"--policy",
				"policies/agent-gate.json",
				"--baseline-policy",
				"policies/agent-gate.baseline.json",
				"--manifest",
				"tools/manifest.json",
				"--fail-on",
				"none",
			],
			{ GITHUB_OUTPUT: outFile },
		);
		expect(readFileSync(outFile, "utf8")).toContain("policy-changed=false");
		rmSync(outFile, { force: true });
	});
});

describe("LSG-ACT23: policy-dir input", () => {
	it("runs static audit with policy-dir without throw", () => {
		const r = runAction([
			"--policy-dir",
			"policies",
			"--manifest",
			"test/fixtures/tools/agent-tools.json",
			"--fail-on",
			"none",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT24: annotate false", () => {
	it("does not print workflow commands when annotate is false", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--annotate",
			"false",
			"--fail-on",
			"none",
		]);
		expect(r.stdout).not.toMatch(/::error file=/);
	});
});

describe("LSG-ACT25: exclude and include forwarded", () => {
	it("honors exclude prefix via CLI passthrough", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--static-root",
			"test/fixtures/tools/walk",
			"--include",
			"walk/apps/agent",
			"--exclude",
			"walk/apps/agent/nope",
			"--fail-on",
			"none",
			"--json",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT26: static-findings output", () => {
	it("writes static-findings count to GITHUB_OUTPUT", () => {
		const outFile = join(tmpdir(), `lsg-act-static-${Date.now()}.txt`);
		runAction(
			[
				"--policy",
				"policies/agent-gate.json",
				"--manifest",
				"test/fixtures/tools/agent-tools-drift.json",
				"--fail-on",
				"none",
			],
			{ GITHUB_OUTPUT: outFile },
		);
		const output = readFileSync(outFile, "utf8");
		expect(output).toMatch(/static-findings=[1-9]/);
		expect(output).toMatch(/drift-count=[1-9]/);
		rmSync(outFile, { force: true });
	});
});

describe("LSG-ACT27: baseline diff fails before static when policy changed", () => {
	it("exits non-zero with fail-on any when baseline differs", () => {
		const tmp = mkdtempSync(join(tmpdir(), "lsg-act-changed-"));
		const changed = join(tmp, "changed.json");
		writeFileSync(
			changed,
			readFileSync(join(rootDir, "policies/agent-gate.json"), "utf8").replace(
				'"grep"',
				'"grep_mutated"',
			),
		);
		const r = runAction([
			"--policy",
			changed,
			"--baseline-policy",
			"policies/agent-gate.baseline.json",
			"--manifest",
			"tools/manifest.json",
			"--fail-on",
			"any",
		]);
		expect(r.status).not.toBe(0);
		rmSync(tmp, { recursive: true, force: true });
	});
});

describe("LSG-ACT28: mode input sets GUARD_MODE", () => {
	it("passes mode through without crashing", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"tools/manifest.json",
			"--mode",
			"audit",
			"--fail-on",
			"none",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT29: sarif-out output path in GITHUB_OUTPUT", () => {
	it("sets sarif-path output when sarif-out provided", () => {
		const tmp = mkdtempSync(join(tmpdir(), "lsg-act-sarif-out-"));
		const sarif = join(tmp, "out.sarif");
		const outFile = join(tmp, "github-out.txt");
		writeFileSync(outFile, "");
		runAction(
			[
				"--policy",
				"policies/agent-gate.json",
				"--manifest",
				"test/fixtures/tools/agent-tools-drift.json",
				"--sarif-out",
				sarif,
				"--fail-on",
				"none",
			],
			{ GITHUB_OUTPUT: outFile },
		);
		expect(readFileSync(outFile, "utf8")).toContain("sarif-path=");
		expect(existsSync(sarif)).toBe(true);
		rmSync(tmp, { recursive: true, force: true });
	});
});

describe("LSG-ACT30: fail-on drift only ignores scan violations", () => {
	it("does not fail on scan violations when fail-on is drift", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--scan-paths",
			"test/fixtures/events/bad-tool.json",
			"--manifest",
			"tools/manifest.json",
			"--fail-on",
			"drift",
		]);
		expect(r.status).toBe(0);
	});
});
