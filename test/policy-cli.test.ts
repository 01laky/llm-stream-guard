/**
 * LSG-POL CLI tests — spawn dist/cli.js
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");

function runCli(args: string[], input?: string) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		input,
		env: { ...process.env, FORCE_COLOR: "0" },
	});
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-POL16: CLI validate ok", () => {
	it("exits 0 on valid policy", () => {
		const r = runCli(["validate", "test/fixtures/policies/valid/minimal.json"]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-POL17: CLI validate fail", () => {
	it("exits 1 on invalid policy", () => {
		const r = runCli(["validate", "test/fixtures/policies/invalid/bad-regexp.json"]);
		expect(r.status).toBe(1);
		expect(r.stderr).toContain("POLICY_E003");
	});
});

describe("LSG-POL18: CLI scan violation", () => {
	it("reports tool policy violation", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/agent-gate.json",
			"test/fixtures/events/bad-tool.json",
		]);
		expect(r.status).toBe(1);
		expect(r.stdout).toMatch(/allow_tools|violation/i);
	});
});

describe("LSG-POL19: CLI scan --json", () => {
	it("outputs parseable JSON", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/agent-gate.json",
			"--json",
			"test/fixtures/events/bad-tool.json",
		]);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.summary).toBeDefined();
		expect(Array.isArray(parsed.violations)).toBe(true);
	});
});

describe("LSG-POL20: CLI diff --check", () => {
	it("exits 1 when policies differ", () => {
		const r = runCli(["diff", "policies/agent-gate.json", "policies/proxy-strict.json", "--check"]);
		expect(r.status).toBe(1);
	});
});

describe("LSG-POL21: CLI profiles list", () => {
	it("lists built-in profiles", () => {
		const r = runCli(["profiles", "list"]);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("proxy-strict");
		expect(r.stdout).toContain("agent-gate");
		expect(r.stdout).toContain("audit-only");
	});
});

describe("LSG-POL22: scan skips node_modules", () => {
	it("does not scan node_modules", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/audit-only.json",
			"test/fixtures/policies/valid",
		]);
		expect(r.stdout).not.toContain("node_modules");
	});
});

describe("LSG-POL24: CLI resolve", () => {
	it("prints merged policy", () => {
		const r = runCli(["resolve", "policies/examples/extends-agent.json", "--json"]);
		expect(r.status).toBe(0);
		const doc = JSON.parse(r.stdout);
		expect(doc.policyVersion).toBe("team-extends-demo");
		expect(doc.rules).toBeDefined();
	});
});

describe("LSG-POL28: CLI stdin scan", () => {
	it("reads stdin via -", () => {
		const sse = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const r = runCli(
			["scan", "--policy", "policies/audit-only.json", "--stdin-format", "sse", "-"],
			sse,
		);
		expect(r.stdout).toMatch(/redact|violation/i);
	});
});

describe("LSG-POL32: packaged CLI validate", () => {
	it("runs validate from npm pack tarball", () => {
		const temp = mkdtempSync(join(tmpdir(), "lsg-pack-"));
		try {
			execFileSync("npm", ["pack", "--pack-destination", temp], {
				cwd: rootDir,
				stdio: "pipe",
			});
			const tarball = execFileSync("ls", [temp], { encoding: "utf8" })
				.trim()
				.split("\n")
				.find((f) => f.endsWith(".tgz"));
			if (!tarball) throw new Error("no tarball");
			execFileSync("npm", ["install", "--ignore-scripts", join(temp, tarball)], {
				cwd: temp,
				stdio: "pipe",
			});
			const bin = join(temp, "node_modules", "llm-stream-guard", "dist", "cli.js");
			const r = spawnSync(
				process.execPath,
				[bin, "validate", join(rootDir, "test/fixtures/policies/valid/minimal.json")],
				{ encoding: "utf8" },
			);
			expect(r.status).toBe(0);
		} finally {
			rmSync(temp, { recursive: true, force: true });
		}
	});
});

describe("LSG-POL edge: CLI help", () => {
	it("prints usage", () => {
		const r = runCli(["--help"]);
		expect(r.stdout).toContain("validate");
		expect(r.stdout).toContain("resolve");
	});
});

describe("LSG-POL edge: scan policyVersion in json", () => {
	it("includes policyVersion in output", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/examples/extends-agent.json",
			"--json",
			"test/fixtures/events/bad-tool.json",
		]);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.summary.policyVersion).toBe("team-extends-demo");
	});
});
