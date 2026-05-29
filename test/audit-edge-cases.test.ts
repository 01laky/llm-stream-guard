/**
 * LSG-STA36+ — extended static audit / CLI edge cases.
 * Complements LSG-STA01–35 with exhaustive programmatic and spawn coverage.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { AuditExit } from "../src/audit/exit-codes.js";
import { scanDangerousStrings, DANGEROUS_PATTERNS } from "../src/audit/dangerous-patterns.js";
import { computeDrift } from "../src/audit/drift.js";
import { parseManifestFile, parseManifestText } from "../src/audit/extract-tools.js";
import { extractPolicyToolSets } from "../src/audit/policy-tool-names.js";
import { staticScanToSarif } from "../src/audit/sarif.js";
import {
	countStaticErrors,
	formatStaticScanReport,
	runStaticScan,
} from "../src/audit/static-scan.js";
import { validateManifestDocument, validateManifestFile } from "../src/audit/validate-manifest.js";
import { walkManifestFiles } from "../src/audit/walk-filters.js";
import { loadPolicy } from "../src/policy/load.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

function tempDir(prefix: string): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function writeManifest(dir: string, name: string, doc: unknown): string {
	const path = join(dir, name);
	writeFileSync(path, JSON.stringify(doc, null, 2));
	return path;
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-STA36: validateManifestDocument exhaustive", () => {
	const cases: Array<{ doc: unknown; expectPaths: string[] }> = [
		{ doc: null, expectPaths: [""] },
		{ doc: "string", expectPaths: [""] },
		{ doc: { version: "2", tools: [{ name: "a" }] }, expectPaths: ["version"] },
		{ doc: { version: "1" }, expectPaths: ["tools"] },
		{ doc: { version: "1", tools: [] }, expectPaths: ["tools"] },
		{ doc: { version: "1", tools: [null] }, expectPaths: ["tools[0]"] },
		{ doc: { version: "1", tools: [{ name: "" }] }, expectPaths: ["tools[0].name"] },
		{ doc: { version: "1", tools: [{ name: 42 }] }, expectPaths: ["tools[0].name"] },
	];

	for (const { doc, expectPaths } of cases) {
		it(`rejects ${JSON.stringify(doc)?.slice(0, 40)}`, () => {
			const errors = validateManifestDocument(doc);
			expect(errors.length).toBeGreaterThan(0);
			for (const p of expectPaths) {
				expect(errors.some((e) => e.path === p || e.path.startsWith(p))).toBe(true);
			}
		});
	}

	it("accepts minimal valid manifest", () => {
		expect(validateManifestDocument({ version: "1", tools: [{ name: "ok" }] })).toHaveLength(0);
	});
});

describe("LSG-STA37: validate-manifest CLI --json", () => {
	it("emits ok:true JSON on valid file", () => {
		const r = runCli([
			"audit",
			"validate-manifest",
			"test/fixtures/tools/agent-tools.json",
			"--json",
		]);
		expect(r.status).toBe(AuditExit.ok);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.ok).toBe(true);
		expect(parsed.errors).toEqual([]);
	});

	it("emits ok:false with errors array on invalid file", () => {
		const r = runCli([
			"audit",
			"validate-manifest",
			"test/fixtures/tools/agent-tools-invalid.json",
			"--json",
		]);
		expect(r.status).toBe(AuditExit.findings);
		const parsed = JSON.parse(r.stdout);
		expect(parsed.ok).toBe(false);
		expect(parsed.errors.length).toBeGreaterThan(0);
	});
});

describe("LSG-STA38: validate-manifest path forms", () => {
	it("positional path matches --manifest flag", () => {
		const a = runCli(["audit", "validate-manifest", "test/fixtures/tools/agent-tools.json"]);
		const b = runCli([
			"audit",
			"validate-manifest",
			"--manifest",
			"test/fixtures/tools/agent-tools.json",
		]);
		expect(a.status).toBe(b.status);
		expect(a.status).toBe(0);
	});

	it("usage error when manifest path omitted", () => {
		expect(runCli(["audit", "validate-manifest"]).status).toBe(AuditExit.usage);
	});
});

describe("LSG-STA39: parseManifestText inline", () => {
	it("parses JSON text without file IO", () => {
		const parsed = parseManifestText(
			"inline.json",
			JSON.stringify({ version: "1", tools: [{ name: "inline_tool", description: "x" }] }),
		);
		expect(parsed.tools).toEqual(["inline_tool"]);
		expect(parsed.strings.some((s) => s.field === "description")).toBe(true);
	});
});

describe("LSG-STA40: MCP function.name shape", () => {
	it("extracts name from tools[].function.name", () => {
		const dir = tempDir("lsg-mcp-fn-");
		const path = writeManifest(dir, "mcp-fn.json", {
			tools: [{ function: { name: "fn_search" }, description: "via function" }],
		});
		expect(parseManifestFile(path).tools).toEqual(["fn_search"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA41: OpenAPI paths.x-tools", () => {
	it("extracts tools from paths.*.post.x-tools", () => {
		const dir = tempDir("lsg-oa-paths-");
		const path = writeManifest(dir, "openapi-paths.json", {
			paths: {
				"/search": {
					post: {
						"x-tools": [{ name: "path_search", description: "from path" }],
					},
				},
			},
		});
		expect(parseManifestFile(path).tools).toEqual(["path_search"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA42: extract skips bad tool entries", () => {
	it("ignores null and nameless entries", () => {
		const dir = tempDir("lsg-skip-tools-");
		const path = writeManifest(dir, "partial.json", {
			version: "1",
			tools: [null, {}, { name: "valid_only" }],
		});
		expect(parseManifestFile(path).tools).toEqual(["valid_only"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA43: nested inputSchema.default strings", () => {
	it("scans default values for dangerous patterns", () => {
		const dir = tempDir("lsg-schema-def-");
		const path = writeManifest(dir, "schema-default.json", {
			version: "1",
			tools: [
				{
					name: "cfg",
					inputSchema: { default: { cmd: "rm -rf /var" } },
				},
			],
		});
		const parsed = parseManifestFile(path);
		const findings = scanDangerousStrings(path, parsed.strings);
		expect(findings.some((f) => f.code === "D002")).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA44: duplicate tool names preserved", () => {
	it("returns duplicate names when manifest lists them twice", () => {
		const dir = tempDir("lsg-dup-tools-");
		const path = writeManifest(dir, "dup.json", {
			version: "1",
			tools: [{ name: "dup" }, { name: "dup" }],
		});
		expect(parseManifestFile(path).tools).toEqual(["dup", "dup"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA45: corrupt manifest parse errors", () => {
	it("validateManifestFile returns parse error for invalid JSON", () => {
		const dir = tempDir("lsg-bad-json-");
		const path = join(dir, "bad.json");
		writeFileSync(path, "{ not json");
		const errors = validateManifestFile(path);
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]!.message.length).toBeGreaterThan(0);
		rmSync(dir, { recursive: true, force: true });
	});

	it("parseManifestFile throws on corrupt JSON", () => {
		const dir = tempDir("lsg-throw-json-");
		const path = join(dir, "bad.json");
		writeFileSync(path, "{");
		expect(() => parseManifestFile(path)).toThrow();
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA46: drift without allowTools rule", () => {
	it("does not emit DRIFT_ALLOW when policy has no allowTools", () => {
		const policy = loadPolicy(join(rootDir, "policies/proxy-strict.json"));
		const sets = extractPolicyToolSets(policy);
		expect(sets.hasAllowRule).toBe(false);
		const findings = computeDrift("/m.json", ["anything", "bash"], sets);
		expect(findings.some((f) => f.code === "DRIFT_ALLOW")).toBe(false);
	});
});

describe("LSG-STA47: drift denyTools only", () => {
	it("flags DRIFT_DENY for denied tool without allow rule", () => {
		const policy = loadPolicy(join(rootDir, "policies/proxy-strict.json"));
		const sets = extractPolicyToolSets(policy);
		const findings = computeDrift("/m.json", ["bash"], sets);
		expect(findings.some((f) => f.code === "DRIFT_DENY" && f.severity === "error")).toBe(true);
	});
});

describe("LSG-STA48: drift allowed and denied overlap in manifest", () => {
	it("emits both DRIFT_ALLOW and DRIFT_DENY when applicable", () => {
		const dir = tempDir("lsg-overlap-pol-");
		const policyPath = join(dir, "overlap.json");
		writeFileSync(
			policyPath,
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [{ allowTools: { names: ["search"] } }, { denyTools: { names: ["bash"] } }],
			}),
		);
		const sets = extractPolicyToolSets(loadPolicy(policyPath));
		const findings = computeDrift("/m.json", ["search", "bash", "rogue"], sets);
		expect(findings.some((f) => f.code === "DRIFT_DENY" && f.tool === "bash")).toBe(true);
		expect(findings.some((f) => f.code === "DRIFT_ALLOW" && f.tool === "rogue")).toBe(true);
		expect(findings.some((f) => f.code === "DRIFT_POLICY_ONLY" && f.tool === "search")).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA49: multiple allowTools rules union", () => {
	it("unions names from sequential allowTools rules", () => {
		const dir = tempDir("lsg-union-allow-");
		const policyPath = join(dir, "union.json");
		writeFileSync(
			policyPath,
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [{ allowTools: { names: ["a"] } }, { allowTools: { names: ["b"] } }],
			}),
		);
		const sets = extractPolicyToolSets(loadPolicy(policyPath));
		expect(sets.allow.has("a")).toBe(true);
		expect(sets.allow.has("b")).toBe(true);
		const findings = computeDrift("/m.json", ["a", "b"], sets);
		expect(findings.filter((f) => f.severity === "error")).toHaveLength(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA50: policy-only warning non-strict exit", () => {
	it("countStaticErrors ignores policy-only warnings without strict", () => {
		const dir = tempDir("lsg-polonly-exit-");
		const policyPath = join(dir, "extra.json");
		writeFileSync(
			policyPath,
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [{ allowTools: { names: ["search", "ghost_tool"] } }],
			}),
		);
		const manifestPath = writeManifest(dir, "m.json", {
			version: "1",
			tools: [{ name: "search" }],
		});
		const report = runStaticScan({ root: dir, policy: policyPath, manifest: manifestPath });
		expect(report.drift.some((f) => f.code === "DRIFT_POLICY_ONLY")).toBe(true);
		expect(countStaticErrors(report, false)).toBe(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA51: dangerous catalog D004–D006", () => {
	const cases: Array<{ id: string; value: string }> = [
		{ id: "D004", value: "run $(whoami) here" },
		{ id: "D005", value: "decode with base64 -d payload" },
		{ id: "D006", value: "fetch http://192.168.1.1/data" },
	];

	for (const { id, value } of cases) {
		it(`detects ${id}`, () => {
			const findings = scanDangerousStrings("f.json", [{ field: "description", value }]);
			expect(findings.some((f) => f.code === id)).toBe(true);
		});
	}

	it("catalog has unique stable IDs", () => {
		const ids = DANGEROUS_PATTERNS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});
});

describe("LSG-STA52: dangerous D003 in examples field", () => {
	it("matches backticks in examples not only description", () => {
		const findings = scanDangerousStrings("f.json", [
			{ field: "examples[0]", value: "run `id` now" },
		]);
		expect(findings.some((f) => f.code === "D003")).toBe(true);
	});
});

describe("LSG-STA53: dangerous pattern boundaries", () => {
	it("does not false-positive on benign text without patterns", () => {
		const findings = scanDangerousStrings("f.json", [
			{ field: "description", value: "Search files at 10am in room 192" },
		]);
		expect(findings).toHaveLength(0);
	});
});

describe("LSG-STA54: blockToolArgs contains matcher", () => {
	it("flags substring from contains rule", () => {
		const dir = tempDir("lsg-contains-bta-");
		const policyPath = join(dir, "contains.json");
		writeFileSync(
			policyPath,
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [{ blockToolArgs: { contains: "SUPER_SECRET" } }],
			}),
		);
		const manifestPath = writeManifest(dir, "m.json", {
			version: "1",
			tools: [{ name: "leak", description: "uses SUPER_SECRET token" }],
		});
		const report = runStaticScan({ root: dir, policy: policyPath, manifest: manifestPath });
		expect(report.blockToolArgs.some((f) => f.code === "BLOCK_ARGS_STATIC")).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA55: multiple blockToolArgs rules", () => {
	it("checks all pattern and contains rules", () => {
		const dir = tempDir("lsg-multi-bta-");
		const policyPath = join(dir, "multi.json");
		writeFileSync(
			policyPath,
			JSON.stringify({
				version: "1",
				mode: "block",
				rules: [
					{ blockToolArgs: { pattern: "curl" } },
					{ blockToolArgs: { contains: "FORBIDDEN" } },
				],
			}),
		);
		const manifestPath = writeManifest(dir, "m.json", {
			version: "1",
			tools: [{ name: "t", examples: ["curl http://x", "FORBIDDEN op"] }],
		});
		const report = runStaticScan({ root: dir, policy: policyPath, manifest: manifestPath });
		expect(report.blockToolArgs.length).toBeGreaterThanOrEqual(2);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA56: walkManifestFiles edge cases", () => {
	it("returns empty array for directory with no manifests", () => {
		const dir = tempDir("lsg-empty-walk-");
		expect(walkManifestFiles({ root: dir })).toEqual([]);
		rmSync(dir, { recursive: true, force: true });
	});

	it("discovers agent.tools.yaml suffix", () => {
		const dir = tempDir("lsg-agent-tools-yaml-");
		const toolsDir = join(dir, "pkg");
		mkdirSync(toolsDir, { recursive: true });
		writeFileSync(
			join(toolsDir, "agent.tools.yaml"),
			'version: "1"\ntools:\n  -\n    name: yaml_agent\n    description: ok\n',
		);
		const found = walkManifestFiles({ root: dir });
		expect(found.some((f) => f.endsWith("agent.tools.yaml"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("exclude prefix removes matches even under include", () => {
		const dir = tempDir("lsg-excl-walk-");
		const nested = join(dir, "apps", "agent", "tools");
		mkdirSync(nested, { recursive: true });
		writeManifest(nested, "manifest.json", { version: "1", tools: [{ name: "x" }] });
		const also = join(dir, "other", "tools");
		mkdirSync(also, { recursive: true });
		writeManifest(also, "manifest.json", { version: "1", tools: [{ name: "y" }] });
		const found = walkManifestFiles({
			root: dir,
			include: ["apps"],
			exclude: ["apps/agent"],
		});
		expect(found.some((f) => f.includes("apps/agent"))).toBe(false);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA57: invalid policy fails static scan", () => {
	it("CLI audit static exits 3 on unreadable policy", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			"test/fixtures/policies/invalid/bad-regexp.json",
			"--manifest",
			"tools/manifest.json",
		]);
		expect(r.status).toBe(AuditExit.internal);
	});
});

describe("LSG-STA58: strict treats dangerous as errors", () => {
	it("countStaticErrors includes dangerous findings when strict", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-dangerous.json",
			strict: true,
		});
		expect(countStaticErrors(report, true)).toBeGreaterThan(0);
	});
});

describe("LSG-STA59: quiet mode output", () => {
	it("suppresses success banner on clean run", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"tools/manifest.json",
			"--quiet",
		]);
		expect(r.status).toBe(0);
		expect(r.stdout.trim()).toBe("");
	});

	it("still exits 1 on drift with quiet", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--quiet",
		]);
		expect(r.status).toBe(1);
		expect(r.stdout).toMatch(/DRIFT_ALLOW|web_search/);
	});
});

describe("LSG-STA60: formatStaticScanReport structure", () => {
	it("lists all finding categories when present", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/proxy-strict.json",
			manifest: "test/fixtures/tools/agent-tools-block-args.json",
		});
		const text = formatStaticScanReport(report, false);
		expect(text).toContain("Static audit:");
		if (report.blockToolArgs.length > 0) {
			expect(text).toContain("BLOCK_ARGS_STATIC");
		}
	});
});

describe("LSG-STA61: SARIF edge cases", () => {
	it("empty report yields valid SARIF with zero results", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools.json",
		});
		const sarif = staticScanToSarif(report) as { runs: Array<{ results: unknown[] }> };
		expect(sarif.runs[0]!.results).toHaveLength(0);
	});

	it("ruleId matches finding code for drift", () => {
		const report = runStaticScan({
			root: rootDir,
			policy: "policies/agent-gate.json",
			manifest: "test/fixtures/tools/agent-tools-drift.json",
		});
		const sarif = staticScanToSarif(report) as {
			runs: Array<{ results: Array<{ ruleId: string }> }>;
		};
		const ids = sarif.runs[0]!.results.map((r) => r.ruleId);
		expect(ids).toContain("DRIFT_ALLOW");
	});
});

describe("LSG-STA62: audit CLI subcommand errors", () => {
	it("unknown audit subcommand exits usage", () => {
		expect(runCli(["audit", "not-a-command"]).status).toBe(AuditExit.usage);
	});

	it("audit drift --json emits parseable findings array", () => {
		const r = runCli([
			"audit",
			"drift",
			"--policy",
			"policies/agent-gate.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-drift.json",
			"--json",
		]);
		const parsed = JSON.parse(r.stdout);
		expect(Array.isArray(parsed.findings)).toBe(true);
		expect(parsed.findings.length).toBeGreaterThan(0);
	});
});

describe("LSG-STA63: GUARD_POLICY_PATH on static", () => {
	it("runs static audit using env policy only", () => {
		const env = { ...process.env, FORCE_COLOR: "0" };
		env.GUARD_POLICY_PATH = join(rootDir, "policies/agent-gate.json");
		const r = spawnSync(
			process.execPath,
			[cliPath, "audit", "static", "--manifest", "tools/manifest.json"],
			{ cwd: rootDir, encoding: "utf8", env },
		);
		expect(r.status).toBe(0);
	});
});

describe("LSG-STA64: comma-separated include prefixes", () => {
	it("CLI --include a,b filters walk", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			"policies/agent-gate.json",
			"--root",
			"test/fixtures/tools/walk",
			"--include",
			"apps/agent,apps/other",
			"--json",
		]);
		const report = JSON.parse(r.stdout);
		expect(report.summary.manifests).toBe(1);
	});
});

describe("LSG-STA65: JSON report blockToolArgs summary", () => {
	it("includes blockToolArgs count in summary", () => {
		const r = runCli([
			"audit",
			"static",
			"--policy",
			"policies/proxy-strict.json",
			"--manifest",
			"test/fixtures/tools/agent-tools-block-args.json",
			"--json",
		]);
		const report = JSON.parse(r.stdout);
		expect(report.summary.blockToolArgs).toBeGreaterThan(0);
		expect(report.blockToolArgs.length).toBeGreaterThan(0);
	});
});

describe("LSG-STA66: extractPolicyToolSets blockToolArgs extraction", () => {
	it("loads pattern and contains matchers from policy", () => {
		const policy = loadPolicy(join(rootDir, "policies/proxy-strict.json"));
		const sets = extractPolicyToolSets(policy);
		expect(sets.blockToolArgs.length).toBeGreaterThan(0);
		expect(sets.blockToolArgs.some((r) => r.pattern)).toBe(true);
	});
});

describe("LSG-STA67: OpenAPI components preferred over paths when tools array present", () => {
	it("uses tools array first when non-empty", () => {
		const dir = tempDir("lsg-oa-priority-");
		const path = writeManifest(dir, "both.json", {
			tools: [{ name: "primary" }],
			components: { "x-tools": [{ name: "secondary" }] },
		});
		expect(parseManifestFile(path).tools).toEqual(["primary"]);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA68: drift finding includes policy label", () => {
	it("policy field set when policy label passed", () => {
		const policy = loadPolicy(join(rootDir, "policies/agent-gate.json"));
		const sets = extractPolicyToolSets(policy);
		const findings = computeDrift("/m.json", ["web_search"], sets, "agent-gate.json");
		expect(findings[0]?.policy).toBe("agent-gate.json");
	});
});

describe("LSG-STA69: validate-manifest malformed YAML file", () => {
	it("returns error for unreadable yaml manifest path", () => {
		const dir = tempDir("lsg-bad-yaml-");
		const path = join(dir, "bad.yaml");
		writeFileSync(path, "tools:\n  - name: [\n");
		const errors = validateManifestFile(path);
		expect(errors.length).toBeGreaterThan(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-STA70: static scan skips unparseable manifest files", () => {
	it("continues walk when one manifest is corrupt", () => {
		const dir = tempDir("lsg-mixed-walk-");
		const toolsDir = join(dir, "tools");
		mkdirSync(toolsDir, { recursive: true });
		writeFileSync(
			join(toolsDir, "manifest.json"),
			JSON.stringify({ version: "1", tools: [{ name: "ok" }] }),
		);
		writeFileSync(join(toolsDir, "broken.json"), "{");
		const report = runStaticScan({
			root: dir,
			policy: join(rootDir, "policies/agent-gate.json"),
		});
		expect(report.summary.manifests).toBeGreaterThanOrEqual(1);
		rmSync(dir, { recursive: true, force: true });
	});
});
