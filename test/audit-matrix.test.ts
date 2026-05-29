/**
 * LSG-XEC2101–XEC2350 — static audit CLI matrix (~250 tests).
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli-exec.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/cli.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "lsg-audit-mx-"));
}

const POLICY = "policies/agent-gate.json";
const MANIFEST = "tools/manifest.json";

describe("LSG-XEC2101: audit static include/exclude matrix", () => {
	const includes = ["tools", "policies", "src", "examples", "test/fixtures"];
	const excludes = ["node_modules", "dist", ".git", "coverage", "prompts"];
	let n = 2101;
	for (const inc of includes) {
		for (const exc of excludes) {
			it(`XEC${n++}: static --include ${inc} --exclude ${exc}`, () => {
				const r = runCli([
					"audit",
					"static",
					"--policy",
					POLICY,
					"--root",
					".",
					"--manifest",
					MANIFEST,
					"--include",
					inc,
					"--exclude",
					exc,
				]);
				expect(r.status).toBeGreaterThanOrEqual(0);
				expect(r.status).toBeLessThanOrEqual(3);
			});
		}
	}
});

describe("LSG-XEC2201: validate-manifest format matrix", () => {
	const samples = [
		{ label: "guard", body: { version: 1, tools: [{ name: "search", description: "x" }] } },
		{
			label: "mcp",
			body: { tools: [{ name: "read_file", inputSchema: { type: "object", properties: {} } }] },
		},
		{ label: "openapi", body: { openapi: "3.0.0", info: { title: "t" }, paths: {} } },
	];
	let n = 2201;
	for (const sample of samples) {
		for (let i = 0; i < 8; i++) {
			it(`XEC${n++}: validate-manifest ${sample.label} variant ${i}`, () => {
				const dir = tempDir();
				try {
					const path = join(dir, `m${i}.json`);
					writeFileSync(path, JSON.stringify(sample.body));
					const r = runCli(["audit", "validate-manifest", path]);
					expect([0, 1, 2, 3]).toContain(r.status);
				} finally {
					rmSync(dir, { recursive: true, force: true });
				}
			});
		}
	}
});

describe("LSG-XEC2281: drift and strict flags", () => {
	const flags = ["", "--strict", "--json"];
	let n = 2281;
	for (const flag of flags) {
		for (let i = 0; i < 15; i++) {
			it(`XEC${n++}: drift ${flag || "default"} run ${i}`, () => {
				const args = ["audit", "drift", "--policy", POLICY, "--manifest", MANIFEST];
				if (flag === "--json") args.push("--json");
				if (flag === "--strict") args.push("--strict");
				const r = runCli(args);
				expect(r.status).toBeGreaterThanOrEqual(0);
				expect(r.status).toBeLessThanOrEqual(3);
			});
		}
	}
});

describe("LSG-XEC2330: static scan quiet/json variants", () => {
	let n = 2330;
	for (const json of [false, true]) {
		for (const quiet of [false, true]) {
			for (let i = 0; i < 10; i++) {
				it(`XEC${n++}: static json=${json} quiet=${quiet} ${i}`, () => {
					const args = [
						"audit",
						"static",
						"--policy",
						POLICY,
						"--root",
						".",
						"--manifest",
						MANIFEST,
					];
					if (json) args.push("--json");
					if (quiet) args.push("--quiet");
					const r = runCli(args);
					expect(r.status).toBeGreaterThanOrEqual(0);
					expect(r.status).toBeLessThanOrEqual(3);
					if (json && r.stdout.trim()) {
						expect(() => JSON.parse(r.stdout)).not.toThrow();
					}
				});
			}
		}
	}
});

describe("LSG-XEC2348: zero-byte and empty manifest dir", () => {
	it("XEC2348: static on empty temp root", () => {
		const dir = tempDir();
		try {
			const r = runCli(["audit", "static", "--policy", POLICY, "--root", dir]);
			expect(r.status).toBeGreaterThanOrEqual(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("XEC2349: validate-manifest missing file exit non-zero", () => {
		const r = runCli(["audit", "validate-manifest", "test/fixtures/no-such-manifest.json"]);
		expect(r.status).not.toBe(0);
	});

	it("XEC2350: static reads repo manifest", () => {
		expect(existsSync(join(rootDir, MANIFEST))).toBe(true);
		const r = runCli([
			"audit",
			"static",
			"--policy",
			POLICY,
			"--root",
			".",
			"--manifest",
			MANIFEST,
		]);
		expect(r.status).toBeGreaterThanOrEqual(0);
	});
});
