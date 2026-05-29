/**
 * LSG-DTR01–DTR12 — doctor CLI readiness checks.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { runCli, runCliJson } from "./helpers/cli-exec.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/cli.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-DTR01–DTR12: doctor command", () => {
	it("DTR01: doctor exits 0 with default policy", () => {
		const r = runCli(["doctor"]);
		expect(r.status).toBe(0);
		expect(r.stdout).toMatch(/OK node:/);
	});

	it("DTR02: doctor --json emits ok and checks array", () => {
		const { status, json } = runCliJson(["doctor", "--json"]);
		expect(status).toBe(0);
		const doc = json as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
		expect(doc.ok).toBe(true);
		expect(doc.checks.length).toBeGreaterThanOrEqual(4);
	});

	it("DTR03: json checks include node", () => {
		const { json } = runCliJson(["doctor", "--json"]);
		const names = (json as { checks: Array<{ name: string }> }).checks.map((c) => c.name);
		expect(names).toContain("node");
	});

	it("DTR04: json checks include dist", () => {
		const { json } = runCliJson(["doctor", "--json"]);
		const names = (json as { checks: Array<{ name: string }> }).checks.map((c) => c.name);
		expect(names).toContain("dist");
	});

	it("DTR05: json checks include version", () => {
		const { json } = runCliJson(["doctor", "--json"]);
		const v = (json as { checks: Array<{ name: string; detail: string }> }).checks.find(
			(c) => c.name === "version",
		);
		expect(v?.detail).toMatch(/^\d+\.\d+\.\d+$/);
	});

	it("DTR06: doctor validates custom policy path", () => {
		const r = runCli(["doctor", "policies/proxy-strict.json"]);
		expect(r.status).toBe(0);
		expect(r.stdout).toMatch(/OK policy:/);
	});

	it("DTR07: doctor fails on invalid policy", () => {
		const r = runCli(["doctor", "test/fixtures/policies/invalid/bad-regexp.json"]);
		expect(r.status).not.toBe(0);
	});

	it("DTR08: human output lists policy check when dist ok", () => {
		const r = runCli(["doctor"]);
		expect(r.stdout).toMatch(/policy:/);
	});

	it("DTR09: human output lists manifest check", () => {
		const r = runCli(["doctor"]);
		expect(r.stdout).toMatch(/manifest:/);
	});

	it("DTR10: usage documents doctor subcommand", () => {
		const r = runCli(["--help"]);
		expect(r.stdout + r.stderr).toContain("doctor");
	});

	it("DTR11: package.json exposes doctor script", () => {
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(pkg.scripts.doctor).toContain("doctor");
	});

	it("DTR12: doctor version matches package.json", () => {
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
			version: string;
		};
		const { json } = runCliJson(["doctor", "--json"]);
		const detail = (json as { checks: Array<{ name: string; detail: string }> }).checks.find(
			(c) => c.name === "version",
		)?.detail;
		expect(detail).toBe(pkg.version);
	});
});

describe("LSG-DTR13–DTR40: doctor policy path matrix", () => {
	const validPolicies = [
		"policies/agent-gate.json",
		"policies/proxy-strict.json",
		"policies/audit-only.json",
		"src/policy/profiles/agent-gate.json",
		"src/policy/profiles/proxy-strict.json",
		"src/policy/profiles/audit-only.json",
		"policies/examples/extends-agent.json",
	] as const;

	const invalidPolicies = [
		"test/fixtures/policies/invalid/bad-regexp.json",
		"test/fixtures/policies/invalid/missing-version.json",
		"test/fixtures/policies/invalid/allow-deny-overlap.json",
	] as const;

	for (let i = 13; i <= 40; i++) {
		it(`DTR${String(i).padStart(2, "0")}: doctor matrix ${i - 12}`, () => {
			const n = i - 13;
			if (n < validPolicies.length) {
				const r = runCli(["doctor", validPolicies[n]!]);
				expect(r.status).toBe(0);
				const { json } = runCliJson(["doctor", validPolicies[n]!, "--json"]);
				const doc = json as { ok: boolean; checks: Array<{ name: string; ok: boolean }> };
				expect(doc.ok).toBe(true);
				expect(doc.checks.find((c) => c.name === "policy")?.ok).toBe(true);
				return;
			}
			const inv = invalidPolicies[(n - validPolicies.length) % invalidPolicies.length]!;
			expect(runCli(["doctor", inv]).status).not.toBe(0);
		});
	}
});
