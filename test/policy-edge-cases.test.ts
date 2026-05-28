/**
 * LSG-POL33+ — extended policy / CLI edge cases (validation codes, merge, YAML, scan, diff).
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { scanContent } from "../src/cli/scan-runner.js";
import { normalizeSseToBytes, normalizeSseText } from "../src/cli/sse-normalize.js";
import {
	compilePolicy,
	createGuardFromPolicy,
	diffPolicies,
	guardEvents,
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
	parsePolicyFile,
	parsePolicyYaml,
	resolvePolicyDocument,
	validatePolicy,
} from "../src/index.js";
import { loadPolicyDocumentFromUnknown } from "../src/policy/load.js";
import { mergePolicyDocuments, resolveExtends, MAX_EXTENDS_DEPTH } from "../src/policy/merge.js";
import { applyModeOverride } from "../src/policy/compile.js";
import { parsePolicyYaml as parseYaml, PolicyYamlError } from "../src/policy/parse-yaml-minimal.js";
import { eventsFrom } from "./helpers/sample-events.js";
import { pipeThroughByteGuard } from "./helpers/guard-bytes.js";
import { collectBytes, splitAtByteIndex, utf8 } from "./helpers/streams.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");

function runCli(args: string[], input?: string, env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		input,
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

function expectCode(
	result: ReturnType<typeof validatePolicy>,
	code: string,
	pathFragment?: string,
): void {
	expect(result.ok).toBe(false);
	if (!result.ok) {
		const match = result.errors.find((e) => e.code === code);
		expect(match, `expected ${code} in ${JSON.stringify(result.errors)}`).toBeDefined();
		if (pathFragment) expect(match?.path).toContain(pathFragment);
	}
}

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "lsg-pol-edge-"));
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-POL33: validatePolicy error codes E001–E002", () => {
	it("E001 when policy is not an object", () => {
		expectCode(validatePolicy(null), POLICY_E001);
	});

	it("E001 on unsupported version", () => {
		expectCode(validatePolicy({ version: "2", rules: [] }), POLICY_E001, "version");
	});

	it("E002 on invalid mode", () => {
		expectCode(validatePolicy({ version: "1", mode: "off", rules: [] }), POLICY_E002, "mode");
	});

	it("E002 when rules is not an array", () => {
		expectCode(validatePolicy({ version: "1", rules: {} }), POLICY_E002, "rules");
	});

	it("E002 when rule entry has multiple keys", () => {
		expectCode(
			validatePolicy({
				version: "1",
				rules: [{ allowTools: { names: ["a"] }, denyTools: { names: ["b"] } }],
			}),
			POLICY_E002,
		);
	});

	it("E002 when rule params are not an object", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ allowTools: "bad" }] }), POLICY_E002);
	});

	it("E002 on unknown byte flag", () => {
		expectCode(
			validatePolicy({ version: "1", byte: { redactSecrets: true, unknown: true } }),
			POLICY_E002,
			"byte",
		);
	});

	it("E002 when byte flag is not boolean", () => {
		expectCode(
			validatePolicy({ version: "1", byte: { redactSecrets: "yes" } }),
			POLICY_E002,
			"byte.redactSecrets",
		);
	});

	it("E002 when extends is not a string", () => {
		expectCode(validatePolicy({ version: "1", extends: 42 }), POLICY_E002, "extends");
	});

	it("E002 when policyVersion is not a string", () => {
		expectCode(validatePolicy({ version: "1", policyVersion: 1 }), POLICY_E002, "policyVersion");
	});

	it("E002 when maxToolArgsBytes.max is invalid", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ maxToolArgsBytes: { max: 0 } }] }),
			POLICY_E002,
			"maxToolArgsBytes",
		);
		expectCode(
			validatePolicy({ version: "1", rules: [{ maxToolArgsBytes: { max: 1.5 } }] }),
			POLICY_E002,
		);
	});

	it("E002 when redactSecrets.placeholder is not a string", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ redactSecrets: { placeholder: 1 } }] }),
			POLICY_E002,
			"placeholder",
		);
	});
});

describe("LSG-POL34: blockToolArgs validation E003/E007", () => {
	it("E007 when both pattern and contains are set", () => {
		expectCode(
			validatePolicy({
				version: "1",
				rules: [{ blockToolArgs: { pattern: "x", contains: "y" } }],
			}),
			POLICY_E007,
		);
	});

	it("E007 when neither pattern nor contains is set", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ blockToolArgs: {} }] }), POLICY_E007);
	});

	it("E003 on invalid RegExp (covered path)", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ blockToolArgs: { pattern: "[unclosed" } }] }),
			POLICY_E003,
		);
	});

	it("accepts contains-only matcher", () => {
		expect(
			validatePolicy({ version: "1", rules: [{ blockToolArgs: { contains: "rm" } }] }).ok,
		).toBe(true);
	});
});

describe("LSG-POL35: allowTools/denyTools names E008", () => {
	it("E008 when names is not an array", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ allowTools: { names: "search" } }] }),
			POLICY_E008,
		);
	});

	it("E008 when name entry is not a string", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ allowTools: { names: [1, 2] } }] }),
			POLICY_E008,
		);
	});

	it("E008 on empty denyTools names", () => {
		expectCode(
			validatePolicy({ version: "1", rules: [{ denyTools: { names: [] } }] }),
			POLICY_E008,
		);
	});

	it("E008 rejects empty allowTools regardless of mode", () => {
		expectCode(
			validatePolicy({ version: "1", mode: "warn", rules: [{ allowTools: { names: [] } }] }),
			POLICY_E008,
		);
	});

	it("E004 on redactPII without email or phone", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ redactPII: {} }] }), POLICY_E004);
	});
});

describe("LSG-POL36: extends errors E005/E006 and missing file", () => {
	it("E005 code on cycle", () => {
		try {
			resolveExtends({ version: "1", extends: "b.json" }, { baseDir: rootDir, chain: ["b.json"] });
			expect.fail("expected throw");
		} catch (err) {
			expect((err as Error & { code?: string }).code).toBe(POLICY_E005);
			expect(String(err)).toMatch(/cycle/);
		}
	});

	it("E006 code on max depth", () => {
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

	it("throws when extends file is missing", () => {
		expect(() =>
			resolveExtends({ version: "1", extends: "no-such-policy-xyz.json" }, { baseDir: rootDir }),
		).toThrow(/not found/);
	});

	it("noExtends skips merge", () => {
		const doc = resolvePolicyDocument(join(rootDir, "policies/examples/extends-agent.json"), {
			noExtends: true,
		});
		expect(doc.extends).toBe("agent-gate");
		expect(doc.rules?.some((r) => "maxToolArgsBytes" in r)).toBe(false);
		expect(doc.rules?.some((r) => "allowTools" in r)).toBe(true);
	});
});

describe("LSG-POL37: merge semantics", () => {
	it("merges byte flags from base and override", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", byte: { redactSecrets: true } },
			{ version: "1", byte: { sanitizeErrors: true } },
		);
		expect(merged.byte).toEqual({ redactSecrets: true, sanitizeErrors: true });
	});

	it("child mode overrides base", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", mode: "block" },
			{ version: "1", mode: "audit" },
		);
		expect(merged.mode).toBe("audit");
	});

	it("child policyVersion overrides base", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", policyVersion: "base-v1" },
			{ version: "1", policyVersion: "child-v2" },
		);
		expect(merged.policyVersion).toBe("child-v2");
	});

	it("appends rule keys not present in base", () => {
		const merged = mergePolicyDocuments(
			{ version: "1", rules: [{ redactSecrets: {} }] },
			{ version: "1", rules: [{ sanitizeErrors: {} }] },
		);
		expect(merged.rules?.map((r) => Object.keys(r)[0])).toEqual([
			"redactSecrets",
			"sanitizeErrors",
		]);
	});

	it("resolves chained file extends", () => {
		const dir = tempDir();
		try {
			writeFileSync(
				join(dir, "base.json"),
				JSON.stringify({ version: "1", rules: [{ redactSecrets: {} }] }),
			);
			writeFileSync(
				join(dir, "mid.json"),
				JSON.stringify({ version: "1", extends: "base.json", rules: [{ sanitizeErrors: {} }] }),
			);
			writeFileSync(
				join(dir, "top.json"),
				JSON.stringify({
					version: "1",
					extends: "mid.json",
					mode: "warn",
					rules: [{ allowTools: { names: ["search"] } }],
				}),
			);
			const resolved = resolvePolicyDocument(join(dir, "top.json"));
			expect(resolved.mode).toBe("warn");
			expect(resolved.rules?.map((r) => Object.keys(r)[0]).sort()).toEqual([
				"allowTools",
				"redactSecrets",
				"sanitizeErrors",
			]);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-POL38: compilePolicy runtime parity", () => {
	it("denyTools blocks denied tool at runtime", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ denyTools: { names: ["bash"] } }],
		});
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
			{ mode: "block", transforms: loaded.transforms },
		)) {
			out.push(e);
		}
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});

	it("redactPII email via policy", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ redactPII: { email: true } }],
		});
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "text", phase: "done", text: "reach me at a@b.co today" }]),
			{ mode: "block", transforms: loaded.transforms },
		)) {
			out.push(e);
		}
		const text = (out[0] as { text?: string }).text ?? "";
		expect(text).not.toContain("a@b.co");
	});

	it("redactSecrets custom placeholder from policy", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ redactSecrets: { placeholder: "***" } }],
		});
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([
				{ type: "text", phase: "done", text: "key=sk-test123456789012345678901234567890" },
			]),
			{ mode: "block", transforms: loaded.transforms },
		)) {
			out.push(e);
		}
		expect((out[0] as { text?: string }).text).toContain("***");
	});

	it("maxToolArgsBytes enforced via policy (delta accumulation)", async () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ maxToolArgsBytes: { max: 4 } }],
		});
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([
				{
					type: "tool_call",
					phase: "delta",
					name: "search",
					id: "1",
					argsText: '{"payload":"12345"}',
				},
				{
					type: "tool_call",
					phase: "done",
					name: "search",
					id: "1",
					args: { payload: "12345" },
				},
			]),
			{ mode: "block", transforms: loaded.transforms },
		)) {
			out.push(e);
		}
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});

	it("warn mode blocks disallowed tool like block", async () => {
		const loaded = compilePolicy({
			version: "1",
			mode: "warn",
			rules: [{ allowTools: { names: ["search"] } }],
		});
		const violations: unknown[] = [];
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
			{
				mode: loaded.mode,
				transforms: loaded.transforms,
				onViolation: (v) => violations.push(v),
			},
		)) {
			out.push(e);
		}
		expect(violations.length).toBeGreaterThan(0);
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});

	it("preserves rule order in transforms", () => {
		const loaded = compilePolicy({
			version: "1",
			rules: [{ redactSecrets: {} }, { allowTools: { names: ["search"] } }, { sanitizeErrors: {} }],
		});
		expect(loaded.rules.map((r) => r.key)).toEqual([
			"redactSecrets",
			"allowTools",
			"sanitizeErrors",
		]);
	});
});

describe("LSG-POL39: YAML parser edge cases", () => {
	it("parses inline flow array", () => {
		const doc = parsePolicyYaml('version: "1"\nnames: [a, b, c]') as Record<string, unknown>;
		expect(doc.names).toEqual(["a", "b", "c"]);
	});

	it("parses booleans and null", () => {
		const doc = parsePolicyYaml("flag: true\nempty: null\nnum: 42") as Record<string, unknown>;
		expect(doc.flag).toBe(true);
		expect(doc.empty).toBe(null);
		expect(doc.num).toBe(42);
	});

	it("strips comments", () => {
		const doc = parsePolicyYaml('version: "1" # inline comment') as Record<string, unknown>;
		expect(doc.version).toBe("1");
	});

	it("rejects tab indentation", () => {
		expect(() => parseYaml("version:\n\tbad: 1")).toThrow(PolicyYamlError);
	});

	it("rejects multiline block scalars", () => {
		expect(() => parseYaml("text: |\n  line")).toThrow(/multiline/);
	});

	it("parsePolicyFile uses YAML for .yaml extension", () => {
		const doc = parsePolicyFile('version: "1"\nmode: audit', "policy.yaml") as Record<
			string,
			unknown
		>;
		expect(doc.mode).toBe("audit");
	});

	it("auto-detects YAML without extension when not JSON", () => {
		const doc = parsePolicyFile('version: "1"\nmode: warn') as Record<string, unknown>;
		expect(doc.mode).toBe("warn");
	});
});

describe("LSG-POL40: SSE normalize edge cases", () => {
	it("skips comment and blank lines", () => {
		const text = ": keepalive\n\ndata: hello\n";
		expect(normalizeSseText(text)).toBe("hello");
	});

	it("strips single leading space after data:", () => {
		const bytes = normalizeSseToBytes("data: spaced\n");
		expect(new TextDecoder().decode(bytes)).toBe("spaced");
	});

	it("preserves non-data lines", () => {
		const text = "event: message\ndata: payload\n";
		expect(normalizeSseText(text)).toContain("event: message");
	});

	it("handles CRLF input", () => {
		const bytes = normalizeSseToBytes("data: a\r\ndata: b\r\n");
		expect(new TextDecoder().decode(bytes)).toBe("a\nb");
	});
});

describe("LSG-POL41: diffPolicies edge cases", () => {
	it("returns changed:false for identical policies", () => {
		const doc = { version: "1", rules: [{ redactSecrets: {} }] };
		expect(diffPolicies(doc, { ...doc, rules: [{ redactSecrets: {} }] }).changed).toBe(false);
	});

	it("detects mode change", () => {
		const diff = diffPolicies({ version: "1", mode: "block" }, { version: "1", mode: "warn" });
		expect(diff.entries.some((e) => e.path === "mode")).toBe(true);
	});

	it("detects byte section change", () => {
		const diff = diffPolicies(
			{ version: "1", byte: { redactSecrets: true } },
			{ version: "1", byte: { redactSecrets: false } },
		);
		expect(diff.entries.some((e) => e.path === "byte")).toBe(true);
	});

	it("detects removed rule", () => {
		const a = { version: "1", rules: [{ redactSecrets: {} }, { sanitizeErrors: {} }] };
		const b = { version: "1", rules: [{ redactSecrets: {} }] };
		expect(diffPolicies(a, b).entries.some((e) => e.kind === "removed")).toBe(true);
	});

	it("detects policyVersion change", () => {
		const diff = diffPolicies(
			{ version: "1", policyVersion: "a" },
			{ version: "1", policyVersion: "b" },
		);
		expect(diff.entries.some((e) => e.path === "policyVersion")).toBe(true);
	});
});

describe("LSG-POL42: loadPolicyDocumentFromUnknown", () => {
	it("compiles inline document", () => {
		const loaded = loadPolicyDocumentFromUnknown({
			version: "1",
			rules: [{ sanitizeErrors: {} }],
		});
		expect(loaded.transforms).toHaveLength(1);
	});

	it("throws aggregated validation errors", () => {
		expect(() =>
			loadPolicyDocumentFromUnknown({ version: "1", rules: [{ blockToolArgs: {} }] }),
		).toThrow(/POLICY_E007/);
	});
});

describe("LSG-POL43: createGuardFromPolicy edge cases", () => {
	it("accepts path string", async () => {
		const guard = createGuardFromPolicy(join(rootDir, "policies/audit-only.json"));
		const payload = new TextEncoder().encode("sk-test123456789012345678901234567890");
		const out = await pipeThroughByteGuard(payload, [payload], {
			...guard.byteOptions,
			mode: guard.mode,
		});
		expect(new TextDecoder().decode(out)).not.toContain("sk-test");
	});

	it("createByteGuard() returns working TransformStream", async () => {
		const guard = createGuardFromPolicy(loadPolicy(join(rootDir, "policies/audit-only.json")));
		const payload = new TextEncoder().encode("token=ghp_1234567890abcdefghij1234567890ab");
		const stream = guard.createByteGuard();
		const readable = new ReadableStream({
			start(controller) {
				controller.enqueue(payload);
				controller.close();
			},
		});
		const reader = readable.pipeThrough(stream).getReader();
		const chunks: Uint8Array[] = [];
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			if (value) chunks.push(value);
		}
		const text = new TextDecoder().decode(
			chunks.reduce((acc, c) => {
				const merged = new Uint8Array(acc.length + c.length);
				merged.set(acc);
				merged.set(c, acc.length);
				return merged;
			}, new Uint8Array()),
		);
		expect(text).not.toContain("ghp_");
	});
});

describe("LSG-POL44: scan-runner programmatic edge cases", () => {
	const auditPolicy = loadPolicy(join(rootDir, "policies/audit-only.json"));
	const gatePolicy = loadPolicy(join(rootDir, "policies/agent-gate.json"));

	it("parses JSONL events", async () => {
		const jsonl =
			'{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n{"type":"finish","reason":"stop"}\n';
		const result = await scanContent("events.jsonl", jsonl, gatePolicy, { ext: ".jsonl" });
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("parses { events: [] } wrapper", async () => {
		const wrapped = JSON.stringify({
			events: [{ type: "tool_call", phase: "done", name: "bash", id: "1" }],
		});
		const result = await scanContent("wrapped.json", wrapped, gatePolicy, { ext: ".json" });
		expect(result.violations.length).toBeGreaterThan(0);
	});

	it("skips binary content", async () => {
		const binary = String.fromCharCode(0, 1, 2, 3);
		const result = await scanContent("blob.bin", binary, auditPolicy, { ext: ".bin" });
		expect(result.skipped).toBe(true);
		expect(result.violations).toHaveLength(0);
	});

	it("clean JSON events produce zero violations", async () => {
		const clean = JSON.stringify([
			{ type: "tool_call", phase: "done", name: "search", id: "1", args: { q: "x" } },
		]);
		const result = await scanContent("clean.json", clean, gatePolicy, { ext: ".json" });
		expect(result.violations).toHaveLength(0);
	});

	it("byte scan counts redactions", async () => {
		const sse = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const result = await scanContent("stream.sse", sse, auditPolicy, { ext: ".sse" });
		expect(result.redactions).toBeGreaterThan(0);
	});

	it("invalid JSON throws", async () => {
		await expect(
			scanContent("bad.json", "{not json", gatePolicy, { ext: ".json" }),
		).rejects.toThrow();
	});
});

describe("LSG-POL45: CLI extended edge cases", () => {
	it("profiles show prints profile JSON", () => {
		const r = runCli(["profiles", "show", "agent-gate"]);
		expect(r.status).toBe(0);
		expect(r.stdout).toContain("allowTools");
	});

	it("profiles show unknown exits 1", () => {
		const r = runCli(["profiles", "show", "no-such-profile"]);
		expect(r.status).toBe(1);
	});

	it("diff --check exits 0 when policies match", () => {
		const p = "test/fixtures/policies/valid/minimal.json";
		const r = runCli(["diff", p, p, "--check"]);
		expect(r.status).toBe(0);
	});

	it("validate missing arg exits 2", () => {
		expect(runCli(["validate"]).status).toBe(2);
	});

	it("scan without --policy exits 2", () => {
		const prev = process.env.GUARD_POLICY_PATH;
		delete process.env.GUARD_POLICY_PATH;
		try {
			expect(runCli(["scan", "README.md"]).status).toBe(2);
		} finally {
			if (prev !== undefined) process.env.GUARD_POLICY_PATH = prev;
		}
	});

	it("scan uses GUARD_POLICY_PATH when --policy omitted", () => {
		const r = runCli(["scan", "test/fixtures/events/bad-tool.json"], undefined, {
			GUARD_POLICY_PATH: "policies/agent-gate.json",
		});
		expect(r.status).toBe(1);
	});

	it("scan --mode audit sets mode in json summary", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/agent-gate.json",
			"--mode",
			"audit",
			"--json",
			"test/fixtures/events/bad-tool.json",
		]);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.summary.mode).toBe("audit");
		expect(parsed.violations.length).toBeGreaterThan(0);
	});

	it("scan clean file exits 0", () => {
		const dir = tempDir();
		try {
			const cleanPath = join(dir, "clean.json");
			writeFileSync(
				cleanPath,
				JSON.stringify([{ type: "tool_call", phase: "done", name: "search", id: "1" }]),
			);
			const r = runCli(["scan", "--policy", "policies/agent-gate.json", cleanPath]);
			expect(r.status).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("validate --json prints ok object", () => {
		const r = runCli(["validate", "test/fixtures/policies/valid/minimal.json", "--json"]);
		expect(r.status).toBe(0);
		expect(JSON.parse(r.stdout).ok).toBe(true);
	});

	it("unknown command exits 2", () => {
		expect(runCli(["not-a-command"]).status).toBe(2);
	});
});

describe("LSG-POL46: conflict codes E009/E010 explicit", () => {
	it("E009 overlap surfaces tool names", () => {
		const result = validatePolicy({
			version: "1",
			rules: [{ allowTools: { names: ["a", "b"] } }, { denyTools: { names: ["b", "c"] } }],
		});
		expectCode(result, POLICY_E009);
		if (!result.ok) expect(result.errors[0]?.message).toContain("b");
	});

	it("empty allowlist in block mode yields E008 or E010", () => {
		const block = validatePolicy({
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: [] } }],
		});
		expect(block.ok).toBe(false);
		if (!block.ok) {
			expect(block.errors.some((e) => e.code === POLICY_E010 || e.code === POLICY_E008)).toBe(true);
		}
		const audit = validatePolicy({
			version: "1",
			mode: "audit",
			rules: [{ allowTools: { names: [] } }],
		});
		expect(audit.ok).toBe(false);
		if (!audit.ok) expect(audit.errors.some((e) => e.code === POLICY_E008)).toBe(true);
	});
});

describe("LSG-POL47: audit mode + loadPolicy failures", () => {
	it("audit mode records violation but passes disallowed tool event", async () => {
		const loaded = compilePolicy({
			version: "1",
			mode: "audit",
			rules: [{ allowTools: { names: ["search"] } }],
		});
		const violations: unknown[] = [];
		const out: unknown[] = [];
		for await (const e of guardEvents(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
			{
				mode: loaded.mode,
				transforms: loaded.transforms,
				onViolation: (v) => violations.push(v),
			},
		)) {
			out.push(e);
		}
		expect(violations.length).toBeGreaterThan(0);
		expect(out.some((e) => (e as { name?: string }).name === "bash")).toBe(true);
	});

	it("loadPolicy throws with stable codes on invalid file", () => {
		expect(() =>
			loadPolicy(join(rootDir, "test/fixtures/policies/invalid/bad-regexp.json")),
		).toThrow(/POLICY_E003/);
	});

	it("resolvePolicyDocument validates merged result", () => {
		expect(() =>
			resolvePolicyDocument(
				join(rootDir, "test/fixtures/policies/invalid/allow-deny-overlap.json"),
			),
		).toThrow(/POLICY_E009/);
	});
});

describe("LSG-POL48: CLI scan formats", () => {
	it("scan jsonl file via CLI", () => {
		const dir = tempDir();
		try {
			const path = join(dir, "events.jsonl");
			writeFileSync(path, '{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n');
			const r = runCli(["scan", "--policy", "policies/agent-gate.json", "--json", path]);
			const parsed = JSON.parse(r.stdout);
			expect(parsed.violations.length).toBeGreaterThan(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("profiles list --json returns array", () => {
		const r = runCli(["profiles", "list", "--json"]);
		expect(r.status).toBe(0);
		expect(JSON.parse(r.stdout)).toContain("audit-only");
	});

	it("diff --json emits entries array", () => {
		const r = runCli(["diff", "policies/agent-gate.json", "policies/proxy-strict.json", "--json"]);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.changed).toBe(true);
		expect(Array.isArray(parsed.entries)).toBe(true);
	});
});

describe("LSG-POL49: applyModeOverride edge cases", () => {
	it("ignores invalid GUARD_MODE and uses options override", () => {
		const prev = process.env.GUARD_MODE;
		process.env.GUARD_MODE = "invalid";
		try {
			expect(applyModeOverride("block", { mode: "audit" })).toBe("audit");
		} finally {
			if (prev === undefined) delete process.env.GUARD_MODE;
			else process.env.GUARD_MODE = prev;
		}
	});

	it("falls back to policy mode when env and options unset", () => {
		const prev = process.env.GUARD_MODE;
		delete process.env.GUARD_MODE;
		try {
			expect(applyModeOverride("warn")).toBe("warn");
		} finally {
			if (prev === undefined) delete process.env.GUARD_MODE;
			else process.env.GUARD_MODE = prev;
		}
	});
});

describe("LSG-POL50: createGuardFromPolicy factory edge cases", () => {
	it("guard() and createByteGuard() share compiled policy mode", async () => {
		const guard = createGuardFromPolicy(join(rootDir, "policies/proxy-strict.json"));
		expect(guard.mode).toBe("block");
		expect(guard.byteOptions.redactSecrets).toBe(true);

		const secret = utf8("sk-test12345678901234567890123456789012");
		const [a, b] = splitAtByteIndex(secret, 5);
		const out = await collectBytes(
			new ReadableStream<Uint8Array>({
				start(c) {
					c.enqueue(a);
					c.enqueue(b);
					c.close();
				},
			}).pipeThrough(guard.createByteGuard()),
		);
		expect(new TextDecoder().decode(out)).not.toContain("sk-test");
	});

	it("event guard blocks denyTools from compiled policy", async () => {
		const guard = createGuardFromPolicy(join(rootDir, "policies/proxy-strict.json"));
		const out: unknown[] = [];
		for await (const e of guard.guard(
			eventsFrom([{ type: "tool_call", phase: "done", name: "bash", id: "1", args: {} }]),
		)) {
			out.push(e);
		}
		expect(out.some((e) => (e as { reason?: string }).reason === "policy_violation")).toBe(true);
	});
});

describe("LSG-POL51: compilePolicy edge cases", () => {
	it("empty rules array yields zero transforms", () => {
		const loaded = compilePolicy({ version: "1", mode: "audit", rules: [] });
		expect(loaded.transforms).toEqual([]);
		expect(loaded.mode).toBe("audit");
	});

	it("byte flags default false when byte section omitted", () => {
		const loaded = compilePolicy({ version: "1", rules: [{ redactSecrets: {} }] });
		expect(loaded.byteOptions.redactSecrets).toBe(false);
		expect(loaded.byteOptions.sanitizeErrors).toBe(false);
	});
});

describe("LSG-POL52: scan-runner additional edge cases", () => {
	it("scanContent on clean-tool fixture returns zero violations", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/events/clean-tool.json"), "utf8");
		const loaded = loadPolicy(join(rootDir, "policies/agent-gate.json"));
		const result = await scanContent("clean-tool.json", raw, loaded, { ext: ".json" });
		expect(result.violations).toHaveLength(0);
		expect(result.skipped).toBe(false);
	});

	it("scanContent on bad-tool fixture reports violations", async () => {
		const raw = readFileSync(join(rootDir, "test/fixtures/events/bad-tool.json"), "utf8");
		const loaded = loadPolicy(join(rootDir, "policies/agent-gate.json"));
		const result = await scanContent("bad-tool.json", raw, loaded, { ext: ".json" });
		expect(result.violations.length).toBeGreaterThan(0);
	});
});
