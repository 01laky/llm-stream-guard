/**
 * LSG-ACT GitHub Action tests
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const actionRun = join(rootDir, "action/run.mjs");
const actionYml = join(rootDir, "action/action.yml");

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

describe("LSG-ACT01: composite action.yml", () => {
	it("uses composite with run.mjs", () => {
		const yml = readFileSync(actionYml, "utf8");
		expect(yml).toContain("using: composite");
		expect(yml).toContain("run.mjs");
	});
});

describe("LSG-ACT02: action README inputs", () => {
	it("documents all inputs", () => {
		const readme = readFileSync(join(rootDir, "action/README.md"), "utf8");
		for (const key of [
			"policy",
			"policy-dir",
			"baseline-policy",
			"scan-paths",
			"static-root",
			"manifest",
			"fail-on",
			"sarif-out",
		]) {
			expect(readme).toContain(key);
		}
	});
});

describe("LSG-ACT03: clean action run", () => {
	it("exits 0 on clean manifest", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--static-root",
			".",
			"--manifest",
			"tools/manifest.json",
			"--fail-on",
			"any",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT04: drift fail-on", () => {
	it("exits non-zero on drift fixture", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--static-root",
			".",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--fail-on",
			"drift",
		]);
		expect(r.status).not.toBe(0);
	});
});

describe("LSG-ACT05: ci-github-action doc", () => {
	it("exists and links action", () => {
		const doc = readFileSync(join(rootDir, "docs/ci-github-action.md"), "utf8");
		expect(doc).toContain("action/");
	});
});

describe("LSG-ACT06: cookbook §11 link", () => {
	it("links ci-github-action.md", () => {
		const cookbook = readFileSync(join(rootDir, "docs/integration-cookbook.md"), "utf8");
		expect(cookbook).toContain("ci-github-action.md");
	});
});

describe("LSG-ACT07: guard-audit workflow", () => {
	it("workflow file exists", () => {
		expect(existsSync(join(rootDir, ".github/workflows/guard-audit.yml"))).toBe(true);
	});
});

describe("LSG-ACT08: dogfood workflow commands", () => {
	it("local equivalent exits 0", () => {
		const r = spawnSync(
			"node",
			[
				join(rootDir, "dist/cli.js"),
				"audit",
				"static",
				"--policy",
				"policies/agent-gate.json",
				"--root",
				".",
				"--manifest",
				"tools/manifest.json",
			],
			{
				cwd: rootDir,
				encoding: "utf8",
			},
		);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT09: fail-on none", () => {
	it("never fails wrapper", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--fail-on",
			"none",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-ACT10: SARIF path", () => {
	it("writes sarif when input set", () => {
		const tmp = mkdtempSync(join(tmpdir(), "lsg-act-sarif-"));
		const out = join(tmp, "findings.sarif");
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--sarif-out",
			out,
			"--fail-on",
			"none",
		]);
		expect(r.status).toBe(0);
		expect(existsSync(out)).toBe(true);
		rmSync(tmp, { recursive: true, force: true });
	});
});

describe("LSG-ACT11: build-diagrams includes ci-action-flow", () => {
	it("lists ci-action-flow.mmd", () => {
		const script = readFileSync(join(rootDir, "scripts/build-diagrams.mjs"), "utf8");
		expect(script).toContain("ci-action-flow.mmd");
	});
});

describe("LSG-ACT12: ci-action-flow.svg committed", () => {
	it("svg exists", () => {
		expect(existsSync(join(rootDir, "docs/img/ci-action-flow.svg"))).toBe(true);
	});
});

describe("LSG-ACT13: annotate drift", () => {
	it("prints workflow command", () => {
		const r = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--annotate",
			"true",
			"--fail-on",
			"none",
		]);
		expect(r.stdout).toMatch(/::error file=/);
	});
});

describe("LSG-ACT14: baseline policy gate", () => {
	it("matching baseline exits 0; changed policy fails", () => {
		const ok = runAction([
			"--policy",
			"policies/agent-gate.json",
			"--baseline-policy",
			"policies/agent-gate.baseline.json",
			"--manifest",
			"tools/manifest.json",
			"--fail-on",
			"any",
		]);
		expect(ok.status).toBe(0);

		const tmp = mkdtempSync(join(tmpdir(), "lsg-changed-policy-"));
		const changed = join(tmp, "changed.json");
		writeFileSync(
			changed,
			readFileSync(join(rootDir, "policies/agent-gate.json"), "utf8").replace(
				'"grep"',
				'"grep_extra"',
			),
		);
		const bad = runAction([
			"--policy",
			changed,
			"--baseline-policy",
			"policies/agent-gate.baseline.json",
			"--manifest",
			"tools/manifest.json",
			"--fail-on",
			"any",
		]);
		expect(bad.status).not.toBe(0);
		rmSync(tmp, { recursive: true, force: true });
	});
});

describe("LSG-ACT15: diff --check invoked", () => {
	it("run.mjs contains diff --check", () => {
		expect(readFileSync(actionRun, "utf8")).toContain("--check");
	});
});

describe("LSG-ACT16: matrix workflow doc", () => {
	it("contains split fail-on jobs", () => {
		const doc = readFileSync(join(rootDir, "docs/ci-github-action.md"), "utf8");
		expect(doc).toMatch(/fail-on:\s*violations/);
		expect(doc).toMatch(/fail-on:\s*drift/);
	});
});

describe("LSG-ACT17: scan-fixtures.sh upgraded", () => {
	it("runs validate scan audit static", () => {
		const sh = readFileSync(join(rootDir, "examples/policy-ci/scan-fixtures.sh"), "utf8");
		expect(sh).toContain("validate");
		expect(sh).toContain("audit static");
	});
});

describe("LSG-ACT18: upload-sarif snippet", () => {
	it("contains stable SARIF upload category", () => {
		const doc = readFileSync(join(rootDir, "docs/ci-github-action.md"), "utf8");
		expect(doc).toMatch(/upload-sarif|codeql/i);
		expect(doc).toContain("category: llm-stream-guard");
	});
});
