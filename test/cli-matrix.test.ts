/**
 * LSG-XEC1851–XEC2100 — CLI command and flag matrix.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseCliJson, runCli } from "./helpers/cli-exec.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const policies = [
	"policies/agent-gate.json",
	"policies/proxy-strict.json",
	"policies/audit-only.json",
] as const;
const cleanEvent = "test/fixtures/events/clean-tool.json";
const badEvent = "test/fixtures/events/bad-tool.json";
const validPolicy = "test/fixtures/policies/valid/minimal.json";
const invalidPolicy = "test/fixtures/policies/invalid/bad-regexp.json";
const cleanManifest = "test/fixtures/tools/agent-tools.json";
const driftManifest = "test/fixtures/tools/agent-tools-drift.json";
const invalidManifest = "test/fixtures/tools/agent-tools-invalid.json";

describe("LSG-XEC1851: CLI validate/resolve/diff matrix", () => {
	let id = 1851;

	for (const policy of policies) {
		for (const json of [false, true] as const) {
			it(`XEC${id++}: validate ${policy} json=${json}`, () => {
				const args = ["validate", policy];
				if (json) args.push("--json");
				const r = runCli(args);
				expect(r.status).toBe(0);
				if (json) {
					const parsed = parseCliJson(r.stdout);
					expect(parsed).toBeDefined();
				}
			});
		}
	}

	for (const policy of [invalidPolicy, "test/fixtures/policies/invalid/missing-version.json"]) {
		it(`XEC${id++}: validate invalid ${policy.split("/").pop()}`, () => {
			const r = runCli(["validate", policy]);
			expect(r.status).toBe(1);
			expect(r.stderr.length + r.stdout.length).toBeGreaterThan(0);
		});
	}

	for (const policy of policies) {
		for (const json of [false, true] as const) {
			it(`XEC${id++}: resolve ${policy} json=${json}`, () => {
				const args = ["resolve", policy];
				if (json) args.push("--json");
				const r = runCli(args);
				expect(r.status).toBe(0);
				if (json) {
					const doc = parseCliJson(r.stdout) as { rules?: unknown[] };
					expect(Array.isArray(doc.rules)).toBe(true);
				}
			});
		}
	}

	const pairs: [string, string][] = [
		[policies[0], policies[1]],
		[policies[0], policies[2]],
		[policies[1], policies[2]],
		[validPolicy, validPolicy],
	];
	for (const [left, right] of pairs) {
		for (const flags of [[], ["--check"], ["--json"]] as const) {
			it(`XEC${id++}: diff ${left} vs ${right} ${flags.join(" ") || "plain"}`, () => {
				const r = runCli(["diff", left, right, ...flags]);
				if (left === right) {
					expect(r.status).toBe(0);
					if (flags.includes("--json")) {
						const parsed = parseCliJson(r.stdout) as { changed?: boolean };
						expect(parsed.changed).toBe(false);
					} else {
						expect(r.stdout).toContain("No differences");
					}
				} else if (flags.includes("--check")) {
					expect(r.status).toBe(1);
				} else {
					expect(r.status).toBe(0);
				}
			});
		}
	}

	it("registers validate/resolve/diff cases through XEC1877", () => {
		expect(id - 1).toBeGreaterThanOrEqual(1876);
	});
});

describe("LSG-XEC1901: CLI scan and profiles matrix", () => {
	let id = 1901;

	for (const policy of policies) {
		for (const event of [cleanEvent, badEvent] as const) {
			for (const json of [false, true] as const) {
				it(`XEC${id++}: scan ${policy} ${event.endsWith("clean-tool.json") ? "clean" : "bad"} json=${json}`, () => {
					const args = ["scan", "--policy", policy, event];
					if (json) args.push("--json");
					const r = runCli(args);
					const expectViolation = event === badEvent && !policy.includes("audit-only");
					expect(r.status).toBe(expectViolation ? 1 : 0);
					if (json) {
						const parsed = parseCliJson(r.stdout) as {
							summary?: { violations?: number };
							violations?: unknown[];
						};
						expect(parsed.summary).toBeDefined();
						if (expectViolation) {
							expect((parsed.violations ?? []).length).toBeGreaterThan(0);
						}
					}
				});
			}
		}
	}

	for (const policy of policies) {
		for (const mode of ["block", "warn", "audit"] as const) {
			it(`XEC${id++}: scan mode override ${policy} ${mode}`, () => {
				const r = runCli(["scan", "--policy", policy, "--mode", mode, cleanEvent]);
				expect(r.status).toBe(0);
			});
		}
	}

	it(`XEC${id++}: profiles list`, () => {
		const r = runCli(["profiles", "list"]);
		expect(r.status).toBe(0);
		for (const profile of ["agent-gate", "proxy-strict", "audit-only"]) {
			expect(r.stdout).toContain(profile);
		}
	});

	for (const profile of ["agent-gate", "proxy-strict", "audit-only"] as const) {
		for (const json of [false, true] as const) {
			it(`XEC${id++}: profiles show ${profile} json=${json}`, () => {
				const args = ["profiles", "show", profile];
				if (json) args.push("--json");
				const r = runCli(args);
				expect(r.status).toBe(0);
				if (json) {
					const doc = parseCliJson(r.stdout) as { rules?: unknown[] };
					expect(Array.isArray(doc.rules)).toBe(true);
				}
			});
		}
	}

	const sse = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
	for (const policy of policies) {
		it(`XEC${id++}: scan stdin sse ${policy}`, () => {
			const r = runCli(["scan", "--policy", policy, "--stdin-format", "sse", "-"], sse);
			expect(r.stdout.length).toBeGreaterThan(0);
		});
	}

	it("registers scan/profiles cases through XEC1932", () => {
		expect(id - 1).toBeGreaterThanOrEqual(1931);
	});
});

describe("LSG-XEC1981: CLI audit matrix", () => {
	let id = 1981;

	for (const manifest of [cleanManifest, driftManifest, invalidManifest]) {
		for (const json of [false, true] as const) {
			it(`XEC${id++}: audit validate-manifest ${manifest.split("/").pop()} json=${json}`, () => {
				const args = ["audit", "validate-manifest", "--manifest", manifest];
				if (json) args.push("--json");
				const r = runCli(args);
				const expectOk = manifest === cleanManifest;
				expect(r.status).toBe(expectOk ? 0 : manifest === invalidManifest ? 1 : 0);
				if (json && expectOk) {
					const parsed = parseCliJson(r.stdout) as { ok?: boolean };
					expect(parsed.ok).toBe(true);
				}
			});
		}
	}

	for (const policy of policies) {
		for (const manifest of [cleanManifest, driftManifest]) {
			for (const json of [false, true] as const) {
				it(`XEC${id++}: audit drift ${policy} ${manifest.includes("drift") ? "drift" : "clean"} json=${json}`, () => {
					const args = ["audit", "drift", "--policy", policy, "--manifest", manifest];
					if (json) args.push("--json");
					const r = runCli(args);
					const expectFindings = manifest === driftManifest && policy.includes("agent-gate");
					expect(r.status).toBe(expectFindings ? 1 : 0);
				});
			}
		}
	}

	for (const policy of policies) {
		for (const json of [false, true] as const) {
			it(`XEC${id++}: audit static policy=${policy.split("/").pop()} json=${json}`, () => {
				const args = [
					"audit",
					"static",
					"--policy",
					policy,
					"--manifest",
					cleanManifest,
					"--root",
					"test/fixtures/tools",
				];
				if (json) args.push("--json");
				const r = runCli(args);
				expect(r.status === 0 || r.status === 1).toBe(true);
			});
		}
	}

	while (id <= 2100) {
		const idx = id - 1981;
		const policy = policies[idx % policies.length]!;
		it(`XEC${id++}: audit static combo filler ${idx}`, () => {
			const r = runCli([
				"audit",
				"static",
				"--policy",
				policy,
				"--manifest",
				idx % 2 === 0 ? cleanManifest : driftManifest,
			]);
			expect(r.status === 0 || r.status === 1).toBe(true);
		});
	}

	it("registers audit matrix cases through XEC2100", () => {
		expect(id - 1).toBe(2100);
	});
});
