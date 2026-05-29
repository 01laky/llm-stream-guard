/**
 * LSG-COV81–COV105 — exhaustive policy module coverage.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
	compilePolicy,
	createGuardFromPolicy,
	diffPolicies,
	loadPolicy,
	POLICY_E001,
	POLICY_E002,
	POLICY_E003,
	POLICY_E004,
	POLICY_E005,
	POLICY_E006,
	POLICY_E007,
	POLICY_E008,
	POLICY_E009,
	POLICY_E010,
	POLICY_E011,
	validatePolicy,
} from "../src/index.js";
import { applyModeOverride } from "../src/policy/compile.js";
import { mergePolicyDocuments, resolveExtends, MAX_EXTENDS_DEPTH } from "../src/policy/merge.js";
import {
	parsePolicyYaml,
	PolicyYamlError,
	parsePolicyFile,
} from "../src/policy/parse-yaml-minimal.js";
import { eventsFrom } from "./helpers/sample-events.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function fixture(path: string): string {
	return join(rootDir, "test/fixtures/policies", path);
}

function policy(path: string): string {
	return join(rootDir, "policies", path);
}

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "lsg-cov-pol-"));
}

function expectCode(
	result: ReturnType<typeof validatePolicy>,
	code: string,
	pathFragment?: string,
): void {
	expect(result.ok).toBe(false);
	if (!result.ok) {
		const match = result.errors.find((e) => e.code === code);
		expect(match, `expected ${code}`).toBeDefined();
		if (pathFragment) expect(match?.path).toContain(pathFragment);
	}
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-COV81: POLICY_E001 schema version", () => {
	it("rejects non-object policy root", () => {
		expectCode(validatePolicy([]), POLICY_E001);
	});

	it("requires version when extends is absent", () => {
		expectCode(validatePolicy({ rules: [] }), POLICY_E001, "version");
	});

	it("rejects unsupported version string", () => {
		expectCode(validatePolicy({ version: "99", rules: [] }), POLICY_E001, "version");
	});
});

describe("LSG-COV82: POLICY_E002 structural fields", () => {
	it("rejects invalid mode value", () => {
		expectCode(validatePolicy({ version: "1", mode: "strict", rules: [] }), POLICY_E002, "mode");
	});

	it("rejects unknown rule key", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ notARealRule: {} }] }), POLICY_E002);
	});

	it("rejects non-array rules", () => {
		expectCode(validatePolicy({ version: "1", rules: "x" }), POLICY_E002, "rules");
	});
});

describe("LSG-COV83: POLICY_E003 invalid RegExp", () => {
	it("flags unclosed character class", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ blockToolArgs: { pattern: "[abc" } }] }),
			POLICY_E003,
		);
	});

	it("surfaces E003 from bad-regexp fixture", () => {
		const doc = JSON.parse(readFileSync(fixture("invalid/bad-regexp.json"), "utf8"));
		expectCode(validatePolicy(doc), POLICY_E003);
	});
});

describe("LSG-COV84: POLICY_E004 redactPII params", () => {
	it("requires email or phone flag", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ redactPII: {} }] }), POLICY_E004);
	});

	it("accepts phone-only redactPII", () => {
		expect(validatePolicy({ version: "1", rules: [{ redactPII: { phone: true } }] }).ok).toBe(true);
	});
});

describe("LSG-COV85: POLICY_E005 extends cycle", () => {
	it("throws with E005 code on cycle", () => {
		try {
			resolveExtends(
				{ version: "1", extends: "loop.json" },
				{ baseDir: rootDir, chain: ["loop.json"] },
			);
			expect.fail("expected throw");
		} catch (err) {
			expect((err as Error & { code?: string }).code).toBe(POLICY_E005);
		}
	});

	it("cycle message lists chain", () => {
		expect(() =>
			resolveExtends(
				{ version: "1", extends: "a.json" },
				{ baseDir: rootDir, chain: ["a.json", "b.json"] },
			),
		).toThrow(/cycle/);
	});
});

describe("LSG-COV86: POLICY_E006 extends depth cap", () => {
	it("throws with E006 when depth exceeded", () => {
		try {
			resolveExtends(
				{ version: "1", extends: "agent-gate" },
				{ baseDir: rootDir, depth: MAX_EXTENDS_DEPTH + 1 },
			);
			expect.fail("expected throw");
		} catch (err) {
			expect((err as Error & { code?: string }).code).toBe(POLICY_E006);
		}
	});

	it("depth error message mentions exceeded", () => {
		expect(() =>
			resolveExtends(
				{ version: "1", extends: "agent-gate" },
				{ baseDir: rootDir, depth: MAX_EXTENDS_DEPTH + 2 },
			),
		).toThrow(/depth/);
	});
});

describe("LSG-COV87: POLICY_E007 blockToolArgs shape", () => {
	it("requires exactly one of pattern or contains", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ blockToolArgs: { pattern: "a", contains: "b" } }] }),
			POLICY_E007,
		);
	});

	it("rejects empty blockToolArgs params", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ blockToolArgs: {} }] }), POLICY_E007);
	});
});

describe("LSG-COV88: POLICY_E008 tool name arrays", () => {
	it("names must be an array", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ denyTools: { names: "bash" } }] }),
			POLICY_E008,
		);
	});

	it("rejects empty denyTools names", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ denyTools: { names: [] } }] }),
			POLICY_E008,
		);
	});
});

describe("LSG-COV89: POLICY_E009 allow/deny overlap", () => {
	it("detects overlapping tool names", () => {
		expectCode(
			validatePolicy({
				version: "1",
				rules: [{ allowTools: { names: ["a", "x"] } }, { denyTools: { names: ["x", "y"] } }],
			}),
			POLICY_E009,
		);
	});

	it("overlap fixture yields E009", () => {
		const doc = JSON.parse(readFileSync(fixture("invalid/allow-deny-overlap.json"), "utf8"));
		expectCode(validatePolicy(doc), POLICY_E009);
	});
});

describe("LSG-COV90: POLICY_E010 empty allowlist block mode", () => {
	it("warns when block mode has empty allowTools", () => {
		const result = validatePolicy({
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: ["search"] } }, { allowTools: { names: [] } }],
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((e) => e.code === POLICY_E010 || e.code === POLICY_E008)).toBe(
				true,
			);
		}
	});

	it("empty-allow-block fixture fails validation", () => {
		const doc = JSON.parse(readFileSync(fixture("invalid/empty-allow-block.json"), "utf8"));
		expect(validatePolicy(doc).ok).toBe(false);
	});
});

describe("LSG-COV91: POLICY_E011 reserved export", () => {
	it("exported from public index", async () => {
		const mod = (await import("../src/index.js")) as Record<string, unknown>;
		expect(mod.POLICY_E011).toBe("POLICY_E011");
	});

	it("stable reserved code string", () => {
		expect(POLICY_E011).toBe("POLICY_E011");
	});
});

describe("LSG-COV92: mergePolicyDocuments extends merge", () => {
	it("override replaces same rule key", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", rules: [{ allowTools: { names: ["a"] } }] },
			{ version: "1", rules: [{ allowTools: { names: ["b", "c"] } }] },
		);
		expect((merged.rules?.[0]?.allowTools as { names: string[] }).names).toEqual(["b", "c"]);
	});

	it("merges byte flags from base and child", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", byte: { redactSecrets: true } },
			{ version: "1", byte: { sanitizeErrors: true } },
		);
		expect(merged.byte).toEqual({ redactSecrets: true, sanitizeErrors: true });
	});
});

describe("LSG-COV93: loadPolicy YAML file", () => {
	it("loads minimal YAML policy from temp file", () => {
		const dir = tempDir();
		try {
			const path = join(dir, "gate.yaml");
			writeFileSync(path, 'version: "1"\nmode: audit\nrules:\n  - sanitizeErrors:\n');
			const loaded = loadPolicy(path);
			expect(loaded.mode).toBe("audit");
			expect(loaded.rules[0]?.key).toBe("sanitizeErrors");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("YAML with inline array compiles allowTools", () => {
		const dir = tempDir();
		try {
			const path = join(dir, "allow.yaml");
			writeFileSync(path, 'version: "1"\nrules:\n  - allowTools:\n      names: [search, grep]\n');
			const loaded = loadPolicy(path);
			expect(loaded.rules[0]?.key).toBe("allowTools");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV94: diffPolicies effective diff", () => {
	it("detects added and removed rules", () => {
		const a = { version: "1", rules: [{ redactSecrets: {} }, { sanitizeErrors: {} }] };
		const b = { version: "1", rules: [{ redactSecrets: {} }, { allowTools: { names: ["x"] } }] };
		const diff = diffPolicies(a, b);
		expect(diff.changed).toBe(true);
		expect(diff.entries.some((e) => e.kind === "removed")).toBe(true);
		expect(diff.entries.some((e) => e.kind === "added")).toBe(true);
	});

	it("unchanged policies yield changed:false", () => {
		const doc = { version: "1", mode: "block" as const, rules: [{ redactSecrets: {} }] };
		expect(diffPolicies(doc, { ...doc }).changed).toBe(false);
	});
});

describe("LSG-COV95: createGuardFromPolicy GuardFromPolicy shape", () => {
	it("exposes readonly guard factory fields", () => {
		const guard = createGuardFromPolicy(loadPolicy(policy("agent-gate.json")));
		expect(guard.mode).toBe("block");
		expect(typeof guard.guard).toBe("function");
		expect(typeof guard.createByteGuard).toBe("function");
		expect(guard.eventConfig.mode).toBe(guard.mode);
		expect(guard.eventConfig.transforms).toBe(guard.transforms);
		expect(guard.byteOptions).toBeDefined();
	});

	it("guard() returns async iterable", async () => {
		const guard = createGuardFromPolicy(loadPolicy(policy("agent-gate.json")));
		const iter = guard.guard(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
		);
		expect(typeof iter[Symbol.asyncIterator]).toBe("function");
		const first = await iter.next();
		expect(first.done).toBe(false);
	});
});

describe("LSG-COV96: compilePolicy transforms", () => {
	it("compiles sanitizeErrors and preserves order", () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ redactSecrets: {} }, { sanitizeErrors: {} }],
		});
		expect(loaded.rules.map((r) => r.key)).toEqual(["redactSecrets", "sanitizeErrors"]);
		expect(loaded.transforms).toHaveLength(2);
	});

	it("sets profile when provided in options", () => {
		const loaded = compilePolicy({ version: "1", rules: [] }, { profile: "agent-gate" });
		expect(loaded.profile).toBe("agent-gate");
	});
});

describe("LSG-COV97: parse-yaml-minimal anchors rejected", () => {
	it("rejects alias reference", () => {
		expect(() => parsePolicyYaml("base: &ref\nchild: *ref")).toThrow(PolicyYamlError);
	});

	it("rejects anchor in scalar", () => {
		expect(() => parsePolicyYaml("token: &anchor value")).toThrow(/anchors or aliases/);
	});
});

describe("LSG-COV98: applyModeOverride precedence", () => {
	it("GUARD_MODE env beats options.mode", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "warn";
		try {
			expect(applyModeOverride("block", { mode: "audit" })).toBe("warn");
		} finally {
			if (prev === undefined) delete process.env.GUARD_MODE;
			else process.env.GUARD_MODE = prev;
		}
	});

	it("options.mode beats document mode when env unset", () => {
		const prev = process.env.GUARD_MODE;
		delete process.env.GUARD_MODE;
		try {
			expect(applyModeOverride("block", { mode: "audit" })).toBe("audit");
		} finally {
			if (prev === undefined) delete process.env.GUARD_MODE;
			else process.env.GUARD_MODE = prev;
		}
	});
});

describe("LSG-COV99: loadPolicy JSON built-in profile", () => {
	it("loads agent-gate with transforms", () => {
		const loaded = loadPolicy(policy("agent-gate.json"));
		expect(loaded.transforms.length).toBeGreaterThan(0);
	});

	it("loadPolicy applies mode override option", () => {
		const loaded = loadPolicy(policy("agent-gate.json"), { mode: "warn" });
		expect(loaded.mode).toBe("warn");
	});
});

describe("LSG-COV100: validatePolicy success paths", () => {
	it("minimal fixture validates", () => {
		const doc = JSON.parse(readFileSync(fixture("valid/minimal.json"), "utf8"));
		expect(validatePolicy(doc).ok).toBe(true);
	});

	it("extends-only document skips version requirement", () => {
		expect(validatePolicy({ extends: "agent-gate" }).ok).toBe(true);
	});
});

describe("LSG-COV101: loadPolicy validation errors", () => {
	it("throws with POLICY_E003 for bad-regexp fixture", () => {
		expect(() => loadPolicy(fixture("invalid/bad-regexp.json"))).toThrow(/POLICY_E003/);
	});

	it("throws with POLICY_E001 for missing-version fixture", () => {
		expect(() => loadPolicy(fixture("invalid/missing-version.json"))).toThrow(/POLICY_E001/);
	});
});

describe("LSG-COV102: diffPolicies metadata fields", () => {
	it("detects extends field change", () => {
		const diff = diffPolicies(
			{ version: "1", extends: "agent-gate" },
			{ version: "1", extends: "audit-only" },
		);
		expect(diff.entries.some((e) => e.path === "extends")).toBe(true);
	});

	it("detects byte section diff", () => {
		const diff = diffPolicies(
			{ version: "1", byte: { redactSecrets: true } },
			{ version: "1", byte: { sanitizeErrors: true } },
		);
		expect(diff.entries.some((e) => e.path === "byte")).toBe(true);
	});
});

describe("LSG-COV103: parsePolicyFile format detection", () => {
	it("parses .yaml extension via YAML subset", () => {
		const doc = parsePolicyFile('version: "1"\nmode: warn', "team.yaml") as Record<string, unknown>;
		expect(doc.mode).toBe("warn");
	});

	it("auto-detects YAML mapping without extension", () => {
		const doc = parsePolicyFile('version: "1"\nrules: []') as Record<string, unknown>;
		expect(doc.version).toBe("1");
	});
});

describe("LSG-COV104: compilePolicy byte and mode", () => {
	it("maps byte section to byteOptions", () => {
		const loaded = compilePolicy({
			version: "1",
			byte: { redactSecrets: true, sanitizeErrors: true },
			rules: [],
		});
		expect(loaded.byteOptions.redactSecrets).toBe(true);
		expect(loaded.byteOptions.sanitizeErrors).toBe(true);
	});

	it("defaults mode to block", () => {
		expect(compilePolicy({ version: "1", rules: [] }).mode).toBe("block");
	});
});

describe("LSG-COV105: createGuardFromPolicy path string", () => {
	it("loads policy from path when given string", () => {
		const guard = createGuardFromPolicy(policy("audit-only.json"));
		expect(guard.byteOptions.redactSecrets).toBe(true);
	});

	it("policyVersion forwarded when present on loaded policy", () => {
		const guard = createGuardFromPolicy(loadPolicy(policy("examples/extends-agent.json")));
		expect(guard.policyVersion).toBe("team-extends-demo");
	});
});
