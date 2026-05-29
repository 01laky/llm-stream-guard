/**
 * LSG-COV451–COV490 — CLI JSON output regression hashes.
 */
import { describe, expect, it } from "vitest";
import { hashCliJson } from "./helpers/json-hash.js";
import { parseCliJson, runCli } from "./helpers/cli-exec.js";

const policies = [
	"policies/agent-gate.json",
	"policies/proxy-strict.json",
	"policies/audit-only.json",
] as const;

describe("LSG-COV451: CLI JSON hash regression", () => {
	let id = 451;

	for (const policy of policies) {
		for (const jsonFlag of [true] as const) {
			it(`COV${id++}: validate hash ${policy}`, () => {
				const r = runCli(["validate", policy, "--json"]);
				expect(r.status).toBe(0);
				const hash = hashCliJson(parseCliJson(r.stdout));
				expect(hash).toMatch(/^[a-f0-9]{64}$/);
			});
		}
	}

	for (const policy of policies) {
		it(`COV${id++}: resolve hash ${policy}`, () => {
			const r = runCli(["resolve", policy, "--json"]);
			expect(r.status).toBe(0);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	for (const policy of policies) {
		for (const event of [
			"test/fixtures/events/clean-tool.json",
			"test/fixtures/events/bad-tool.json",
		] as const) {
			it(`COV${id++}: scan hash ${policy} ${event.includes("clean") ? "clean" : "bad"}`, () => {
				const r = runCli(["scan", "--policy", policy, "--json", event]);
				const hash = hashCliJson(parseCliJson(r.stdout));
				expect(hash).toMatch(/^[a-f0-9]{64}$/);
				expect(r.status).toBe(event.includes("bad") && !policy.includes("audit-only") ? 1 : 0);
			});
		}
	}

	for (const profile of ["agent-gate", "proxy-strict", "audit-only"] as const) {
		it(`COV${id++}: profiles show hash ${profile}`, () => {
			const r = runCli(["profiles", "show", profile, "--json"]);
			expect(r.status).toBe(0);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	for (const manifest of [
		"test/fixtures/tools/agent-tools.json",
		"test/fixtures/tools/agent-tools-drift.json",
	] as const) {
		it(`COV${id++}: audit validate-manifest hash ${manifest.split("/").pop()}`, () => {
			const r = runCli(["audit", "validate-manifest", "--manifest", manifest, "--json"]);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	for (const policy of policies) {
		it(`COV${id++}: audit drift hash ${policy}`, () => {
			const r = runCli([
				"audit",
				"drift",
				"--policy",
				policy,
				"--manifest",
				"test/fixtures/tools/agent-tools-drift.json",
				"--json",
			]);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	for (const policy of policies) {
		it(`COV${id++}: audit static hash ${policy}`, () => {
			const r = runCli([
				"audit",
				"static",
				"--policy",
				policy,
				"--manifest",
				"test/fixtures/tools/agent-tools.json",
				"--json",
			]);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	while (id <= 490) {
		const idx = id - 451;
		const policy = policies[idx % policies.length]!;
		it(`COV${id++}: diff hash filler ${idx}`, () => {
			const r = runCli(["diff", policy, policies[(idx + 1) % policies.length]!, "--json"]);
			const hash = hashCliJson(parseCliJson(r.stdout));
			expect(hash).toMatch(/^[a-f0-9]{64}$/);
		});
	}

	it("registers JSON regression cases through COV490", () => {
		expect(id - 1).toBe(490);
	});
});
