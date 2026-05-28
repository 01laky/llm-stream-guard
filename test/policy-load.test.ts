/**
 * LSG-POL* — policy loader, validate, compile, merge, diff.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
	allowTools,
	blockToolArgs,
	compilePolicy,
	createGuardFromPolicy,
	createByteGuard,
	diffPolicies,
	guardEvents,
	loadPolicy,
	maxToolArgsBytes,
	parsePolicyYaml,
	POLICY_E003,
	POLICY_E008,
	POLICY_E009,
	POLICY_E010,
	resolvePolicyDocument,
	sanitizeErrors,
	validatePolicy,
} from "../src/index.js";
import { normalizeSseToBytes } from "../src/cli/sse-normalize.js";
import { mergePolicyDocuments, resolveExtends, MAX_EXTENDS_DEPTH } from "../src/policy/merge.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

function fixture(path: string): string {
	return join(rootDir, "test/fixtures/policies", path);
}

function policy(path: string): string {
	return join(rootDir, "policies", path);
}

describe("LSG-POL01: valid minimal JSON", () => {
	it("passes validatePolicy", () => {
		const doc = JSON.parse(readFileSync(fixture("valid/minimal.json"), "utf8"));
		const result = validatePolicy(doc);
		expect(result.ok).toBe(true);
	});
});

describe("LSG-POL02: missing version", () => {
	it("fails with path in message", () => {
		const doc = JSON.parse(readFileSync(fixture("invalid/missing-version.json"), "utf8"));
		const result = validatePolicy(doc);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]?.path).toBe("version");
		}
	});
});

describe("LSG-POL03: unknown rule key", () => {
	it("rejects unknown key", () => {
		const result = validatePolicy({
			version: "1",
			rules: [{ unknownRule: {} }],
		});
		expect(result.ok).toBe(false);
	});
});

describe("LSG-POL04: loadPolicy compiles transforms", () => {
	it("matches manual stack for agent-gate", async () => {
		const loaded = loadPolicy(policy("agent-gate.json"));
		const manual = [
			allowTools(["search", "read_file", "grep"]),
			maxToolArgsBytes(65536),
			sanitizeErrors(),
		];
		const event = {
			type: "tool_call" as const,
			phase: "done" as const,
			name: "bash",
			id: "1",
		};
		const outManual: unknown[] = [];
		for await (const e of guardEvents(eventsFrom([event]), { mode: "block", transforms: manual })) {
			outManual.push(e);
		}
		const outLoaded: unknown[] = [];
		for await (const e of guardEvents(eventsFrom([event]), {
			mode: loaded.mode,
			transforms: loaded.transforms,
		})) {
			outLoaded.push(e);
		}
		expect(outLoaded).toEqual(outManual);
	});
});

describe("LSG-POL05: blockToolArgs pattern and contains", () => {
	it("compiles RegExp pattern", () => {
		const result = validatePolicy({
			version: "1",
			rules: [{ blockToolArgs: { pattern: "rm\\s+-rf" } }],
		});
		expect(result.ok).toBe(true);
	});
	it("invalid pattern returns POLICY_E003", () => {
		const result = validatePolicy(
			JSON.parse(readFileSync(fixture("invalid/bad-regexp.json"), "utf8")),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.code === POLICY_E003)).toBe(true);
	});
	it("contains matcher works at runtime", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ blockToolArgs: { contains: "rm -rf" } }],
		});
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([
				{
					type: "tool_call",
					phase: "done",
					name: "bash",
					id: "1",
					args: { cmd: "rm -rf /" },
				},
			]),
			{ mode: "block", transforms: loaded.transforms },
		)) {
			out.push(e);
		}
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});
});

describe("LSG-POL06: extends merge", () => {
	it("override allowTools replaces profile entry", () => {
		const resolved = resolvePolicyDocument(policy("examples/extends-agent.json"));
		const allow = resolved.rules?.find((r) => "allowTools" in r)?.allowTools as { names: string[] };
		expect(allow.names).toContain("bash");
		expect(allow.names).toContain("search");
	});
});

describe("LSG-POL07: extends cycle", () => {
	it("throws on cycle", () => {
		expect(() =>
			resolveExtends({ version: "1", extends: "a.json" }, { baseDir: rootDir, chain: ["a.json"] }),
		).toThrow(/cycle/);
	});
});

describe("LSG-POL08: extends max depth", () => {
	it("throws when depth exceeded", () => {
		expect(() =>
			resolveExtends(
				{ version: "1", extends: "agent-gate" },
				{ baseDir: rootDir, depth: MAX_EXTENDS_DEPTH + 1 },
			),
		).toThrow(/depth/);
	});
});

describe("LSG-POL09: YAML parse", () => {
	it("parses YAML equivalent to JSON", () => {
		const yaml = `
version: "1"
mode: block
rules:
  - allowTools:
      names: [search]
`;
		const doc = parsePolicyYaml(yaml) as Record<string, unknown>;
		expect(doc.version).toBe("1");
		expect(validatePolicy(doc).ok).toBe(true);
	});
});

describe("LSG-POL10: byte section", () => {
	it("maps to createByteGuard options", () => {
		const loaded = loadPolicy(policy("audit-only.json"));
		expect(loaded.byteOptions.redactSecrets).toBe(true);
		expect(loaded.byteOptions.sanitizeErrors).toBe(true);
	});
});

describe("LSG-POL11: mode override", () => {
	it("LoadPolicyOptions.mode overrides file", () => {
		const loaded = loadPolicy(policy("agent-gate.json"), { mode: "audit" });
		expect(loaded.mode).toBe("audit");
	});
});

describe("LSG-POL12: diffPolicies rule change", () => {
	it("detects param change", () => {
		const a = { version: "1", rules: [{ allowTools: { names: ["search"] } }] };
		const b = { version: "1", rules: [{ allowTools: { names: ["search", "grep"] } }] };
		const diff = diffPolicies(a, b);
		expect(diff.changed).toBe(true);
		expect(diff.entries.some((e) => e.path === "rules.allowTools")).toBe(true);
	});
});

describe("LSG-POL13: diffPolicies add/remove", () => {
	it("detects added rule", () => {
		const a = { version: "1", rules: [{ redactSecrets: {} }] };
		const b = {
			version: "1",
			rules: [{ redactSecrets: {} }, { sanitizeErrors: {} }],
		};
		const diff = diffPolicies(a, b);
		expect(diff.entries.some((e) => e.kind === "added")).toBe(true);
	});
});

describe("LSG-POL14: built-in profiles validate", () => {
	it("all profiles pass validate", () => {
		for (const id of ["proxy-strict", "agent-gate", "audit-only"]) {
			const doc = resolvePolicyDocument(join(rootDir, "src/policy/profiles", `${id}.json`));
			expect(validatePolicy(doc).ok).toBe(true);
		}
	});
});

describe("LSG-POL15: relative extends path", () => {
	it("resolves from policy directory", () => {
		const resolved = resolvePolicyDocument(policy("examples/extends-agent.json"));
		expect(resolved.rules?.length).toBeGreaterThan(0);
	});
});

describe("LSG-POL23: createGuardFromPolicy", () => {
	it("guard() matches manual wiring", async () => {
		const loaded = loadPolicy(policy("agent-gate.json"));
		const guard = createGuardFromPolicy(loaded);
		const event = { type: "tool_call" as const, phase: "done" as const, name: "bash", id: "1" };
		const out: unknown[] = [];
		for await (const e of guard.guard(eventsFrom([event]))) out.push(e);
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});
	it("createByteGuard redacts secrets", async () => {
		const guard = createGuardFromPolicy(loadPolicy(policy("audit-only.json")));
		const payload = new TextEncoder().encode("key=sk-test123456789012345678901234567890");
		const out = await pipeThroughByteGuard(payload, [payload], {
			...guard.byteOptions,
			mode: guard.mode,
		});
		expect(new TextDecoder().decode(out)).not.toContain("sk-test");
	});
});

describe("LSG-POL26: policyVersion in scan metadata", () => {
	it("loaded policy carries policyVersion", () => {
		const resolved = resolvePolicyDocument(policy("examples/extends-agent.json"));
		expect(resolved.policyVersion).toBe("team-extends-demo");
	});
});

describe("LSG-POL29: SSE normalize", () => {
	it("strips data: prefix for byte scan", () => {
		const text = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const bytes = normalizeSseToBytes(text);
		expect(new TextDecoder().decode(bytes)).not.toMatch(/^data:/m);
	});
});

describe("LSG-POL30: error codes", () => {
	it("validatePolicy exposes stable code", () => {
		const result = validatePolicy(
			JSON.parse(readFileSync(fixture("invalid/bad-regexp.json"), "utf8")),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors[0]?.code).toBe(POLICY_E003);
		}
	});
});

describe("LSG-POL31: rule conflicts", () => {
	it("POLICY_E009 on overlap", () => {
		const result = validatePolicy(
			JSON.parse(readFileSync(fixture("invalid/allow-deny-overlap.json"), "utf8")),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.some((e) => e.code === POLICY_E009)).toBe(true);
	});
	it("POLICY_E010 on empty allowlist block", () => {
		const result = validatePolicy(
			JSON.parse(readFileSync(fixture("invalid/empty-allow-block.json"), "utf8")),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((e) => e.code === POLICY_E010 || e.code === POLICY_E008)).toBe(
				true,
			);
		}
	});
});

describe("LSG-POL edge: merge replace same key", () => {
	it("second allowTools replaces first", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", rules: [{ allowTools: { names: ["a"] } }] },
			{ version: "1", rules: [{ allowTools: { names: ["b"] } }] },
		);
		const names = (merged.rules?.[0]?.allowTools as { names: string[] }).names;
		expect(names).toEqual(["b"]);
	});
});

describe("LSG-POL edge: blockToolArgs on delta ignored", () => {
	it("policy blockToolArgs only blocks on done", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ blockToolArgs: { contains: "secret" } }],
		});
		const delta = {
			type: "tool_call" as const,
			phase: "delta" as const,
			name: "bash",
			id: "1",
			argsText: '{"secret":',
		};
		const out: unknown[] = [];
		for await (const e of guardEvents(eventsFrom([delta]), {
			mode: "block",
			transforms: loaded.transforms,
		})) {
			out.push(e);
		}
		expect(out).toHaveLength(1);
	});
});

describe("LSG-POL edge: GUARD_MODE env", () => {
	it("applyModeOverride reads env", async () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "audit";
		try {
			const loaded = loadPolicy(policy("agent-gate.json"), { mode: "block" });
			expect(loaded.mode).toBe("audit");
		} finally {
			if (prev === undefined) delete process.env.GUARD_MODE;
			else process.env.GUARD_MODE = prev;
		}
	});
});

describe("LSG-POL edge: redactPII policy", () => {
	it("requires email or phone flag", () => {
		const result = validatePolicy({
			version: "1",
			rules: [{ redactPII: {} }],
		});
		expect(result.ok).toBe(false);
	});
});

describe("LSG-POL edge: YAML rejects anchors", () => {
	it("throws PolicyYamlError on alias", () => {
		expect(() => parsePolicyYaml("key: &ref\nother: *ref")).toThrow(/not supported/);
	});
});

describe("LSG-POL25: schema file", () => {
	it("exists with rule keys", () => {
		const schema = readFileSync(join(rootDir, "schemas/policy-v1.json"), "utf8");
		expect(schema).toContain("redactSecrets");
		expect(schema).toContain("allowTools");
		expect(schema).toContain("blockToolArgs");
	});
});
