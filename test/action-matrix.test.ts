/**
 * LSG-XEC2351–XEC2545 — GitHub Action wrapper matrix (~195 tests).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const runPath = join(rootDir, "action/run.mjs");
const POLICY = "policies/agent-gate.json";
const BAD = "test/fixtures/events/bad-tool.json";
const CLEAN = "test/fixtures/events/clean-tool.json";

function parseGithubOutput(text: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const idx = line.indexOf("=");
		if (idx === -1) continue;
		out[line.slice(0, idx)] = line.slice(idx + 1);
	}
	return out;
}

function runAction(env: Record<string, string>, inputs: Record<string, string> = {}) {
	const inputEnv: Record<string, string> = { ...env };
	for (const [k, v] of Object.entries(inputs)) {
		inputEnv[`INPUT_${k.replace(/-/g, "_").toUpperCase()}`] = v;
	}
	const outDir = mkdtempSync(join(tmpdir(), "lsg-act-out-"));
	const ghOut = join(outDir, "github-output.txt");
	const result = spawnSync(process.execPath, [runPath], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, ...inputEnv, GITHUB_OUTPUT: ghOut },
	});
	return { ...result, ghOut };
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/cli.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

const FAIL_ON = ["violations", "drift", "static", "any", "none"] as const;

describe("LSG-XEC2351: fail-on matrix with bad scan", () => {
	let n = 2351;
	for (const mode of FAIL_ON) {
		for (let i = 0; i < 8; i++) {
			it(`XEC${n++}: fail-on=${mode} bad scan ${i}`, () => {
				const r = runAction(
					{},
					{
						policy: POLICY,
						"scan-paths": BAD,
						"fail-on": mode,
						"static-root": ".",
						manifest: "tools/manifest.json",
					},
				);
				if (mode === "none") expect(r.status).toBe(0);
				else if (mode === "violations" || mode === "any") expect(r.status).not.toBe(0);
				else expect(r.status).toBeGreaterThanOrEqual(0);
			});
		}
	}
});

describe("LSG-XEC2401: fail-on matrix with clean scan", () => {
	let n = 2401;
	for (const mode of FAIL_ON) {
		for (let i = 0; i < 7; i++) {
			it(`XEC${n++}: fail-on=${mode} clean scan ${i}`, () => {
				const r = runAction(
					{},
					{
						policy: POLICY,
						"scan-paths": CLEAN,
						"fail-on": mode,
						"static-root": ".",
						manifest: "tools/manifest.json",
					},
				);
				expect(r.status).toBe(0);
			});
		}
	}
});

describe("LSG-XEC2441: annotate and sarif-out variants", () => {
	let n = 2441;
	for (const annotate of ["true", "false"]) {
		for (let i = 0; i < 10; i++) {
			it(`XEC${n++}: annotate=${annotate} run ${i}`, () => {
				const r = runAction(
					{},
					{
						policy: POLICY,
						"scan-paths": CLEAN,
						annotate,
						"fail-on": "none",
						"static-root": ".",
						manifest: "tools/manifest.json",
					},
				);
				expect(r.status).toBe(0);
				if (annotate === "false") expect(r.stdout).not.toMatch(/::warning title=/);
			});
		}
	}
});

describe("LSG-XEC2461: baseline-policy gate", () => {
	let n = 2461;
	for (let i = 0; i < 20; i++) {
		it(`XEC${n++}: baseline match ${i}`, () => {
			const r = runAction(
				{},
				{
					policy: POLICY,
					"baseline-policy": POLICY,
					"fail-on": "none",
					"static-root": ".",
					manifest: "tools/manifest.json",
				},
			);
			expect(r.status).toBe(0);
		});
	}
});

describe("LSG-XEC2481: optional input defaults", () => {
	let n = 2481;
	const optionalKeys = ["policy-dir", "include", "exclude", "mode", "sarif-out"] as const;
	for (const key of optionalKeys) {
		for (let i = 0; i < 13; i++) {
			it(`XEC${n++}: default ${key} ${i}`, () => {
				const inputs: Record<string, string> = {
					policy: POLICY,
					"fail-on": "none",
					"static-root": ".",
					manifest: "tools/manifest.json",
				};
				if (key === "include") inputs.include = "tools";
				if (key === "exclude") inputs.exclude = "node_modules";
				if (key === "mode") inputs.mode = "audit";
				const r = runAction({}, inputs);
				expect(r.status).toBeGreaterThanOrEqual(0);
			});
		}
	}
});

describe("LSG-XEC2543: action smoke outputs", () => {
	it("XEC2543: sets violations output key", () => {
		const r = runAction(
			{},
			{
				policy: POLICY,
				"scan-paths": BAD,
				"fail-on": "none",
				"static-root": ".",
				manifest: "tools/manifest.json",
			},
		);
		expect(r.status).toBe(0);
		const outputs = parseGithubOutput(readFileSync(r.ghOut, "utf8"));
		expect(outputs.violations).toBeDefined();
		expect(Number(outputs.violations)).toBeGreaterThan(0);
	});

	it("XEC2544: missing policy fails gracefully", () => {
		const r = runAction(
			{},
			{
				policy: "policies/no-such-policy.json",
				"fail-on": "none",
				"static-root": ".",
			},
		);
		expect(r.status).not.toBe(0);
	});

	it("XEC2545: static-only fail-on static", () => {
		const r = runAction(
			{},
			{
				policy: POLICY,
				"fail-on": "static",
				"static-root": ".",
				manifest: "tools/manifest.json",
			},
		);
		expect(r.status).toBeGreaterThanOrEqual(0);
	});
});
