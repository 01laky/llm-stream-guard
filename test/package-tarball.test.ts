/**
 * LSG-PKG01–PKG25 — npm pack tarball CLI smoke matrix.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

let tarballPath: string;
let binPath: string;

beforeAll(() => {
	const temp = mkdtempSync(join(tmpdir(), "lsg-pack-matrix-"));
	execFileSync("npm", ["pack", "--pack-destination", temp], { cwd: rootDir, stdio: "pipe" });
	const tarball = execFileSync("ls", [temp], { encoding: "utf8" })
		.trim()
		.split("\n")
		.find((f) => f.endsWith(".tgz"));
	if (!tarball) throw new Error("no tarball produced");
	tarballPath = join(temp, tarball);
	const installDir = mkdtempSync(join(tmpdir(), "lsg-pack-install-"));
	execFileSync("npm", ["install", "--ignore-scripts", tarballPath], {
		cwd: installDir,
		stdio: "pipe",
	});
	binPath = join(installDir, "node_modules", "llm-stream-guard", "dist", "cli.js");
	if (!existsSync(binPath)) throw new Error("packaged cli missing");
}, 60_000);

function runPacked(args: string[], input?: string) {
	return spawnSync(process.execPath, [binPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		input,
		env: { ...process.env, FORCE_COLOR: "0" },
	});
}

describe("LSG-PKG01: packaged CLI matrix", () => {
	const cases: Array<{ id: number; args: string[]; expectStatus: number; input?: string }> = [
		{ id: 1, args: ["validate", "test/fixtures/policies/valid/minimal.json"], expectStatus: 0 },
		{
			id: 2,
			args: ["validate", "test/fixtures/policies/invalid/bad-regexp.json"],
			expectStatus: 1,
		},
		{ id: 3, args: ["validate", "policies/agent-gate.json"], expectStatus: 0 },
		{ id: 4, args: ["validate", "policies/proxy-strict.json"], expectStatus: 0 },
		{ id: 5, args: ["validate", "policies/audit-only.json"], expectStatus: 0 },
		{ id: 6, args: ["resolve", "policies/agent-gate.json", "--json"], expectStatus: 0 },
		{ id: 7, args: ["profiles", "list"], expectStatus: 0 },
		{ id: 8, args: ["profiles", "show", "audit-only", "--json"], expectStatus: 0 },
		{
			id: 9,
			args: ["scan", "--policy", "policies/agent-gate.json", "test/fixtures/events/bad-tool.json"],
			expectStatus: 1,
		},
		{
			id: 10,
			args: [
				"scan",
				"--policy",
				"policies/agent-gate.json",
				"test/fixtures/events/clean-tool.json",
			],
			expectStatus: 0,
		},
		{
			id: 11,
			args: ["diff", "policies/agent-gate.json", "policies/proxy-strict.json", "--check"],
			expectStatus: 1,
		},
		{
			id: 12,
			args: ["audit", "validate-manifest", "--manifest", "test/fixtures/tools/agent-tools.json"],
			expectStatus: 0,
		},
		{
			id: 13,
			args: [
				"audit",
				"drift",
				"--policy",
				"policies/agent-gate.json",
				"--manifest",
				"test/fixtures/tools/agent-tools-drift.json",
			],
			expectStatus: 1,
		},
		{
			id: 14,
			args: ["audit", "static", "--policy", "policies/audit-only.json"],
			expectStatus: 0,
		},
		{ id: 15, args: ["--help"], expectStatus: 2 },
		{
			id: 16,
			args: ["scan", "--policy", "policies/audit-only.json", "--stdin-format", "sse", "-"],
			expectStatus: 1,
			input: readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8"),
		},
		{
			id: 17,
			args: [
				"scan",
				"--policy",
				"policies/proxy-strict.json",
				"--json",
				"test/fixtures/events/clean-tool.json",
			],
			expectStatus: 0,
		},
		{
			id: 18,
			args: ["resolve", "policies/proxy-strict.json"],
			expectStatus: 0,
		},
		{ id: 19, args: ["doctor", "--json"], expectStatus: 0 },
		{ id: 20, args: ["doctor", "policies/agent-gate.json"], expectStatus: 0 },
		{
			id: 21,
			args: [
				"audit",
				"static",
				"--policy",
				"policies/agent-gate.json",
				"--manifest",
				"test/fixtures/tools/agent-tools.json",
			],
			expectStatus: 0,
		},
		{
			id: 22,
			args: [
				"scan",
				"--policy",
				"policies/proxy-strict.json",
				"--json",
				"test/fixtures/events/clean-tool.json",
			],
			expectStatus: 0,
		},
		{ id: 23, args: ["profiles", "show", "proxy-strict"], expectStatus: 0 },
		{ id: 24, args: ["validate", "src/policy/profiles/agent-gate.json"], expectStatus: 0 },
		{
			id: 25,
			args: ["diff", "policies/audit-only.json", "policies/proxy-strict.json"],
			expectStatus: 0,
		},
	];

	for (const c of cases) {
		it(`PKG${String(c.id).padStart(2, "0")}: ${c.args.slice(0, 2).join(" ")}`, () => {
			const r = runPacked(c.args, c.input);
			expect(r.status).toBe(c.expectStatus);
		});
	}
});
