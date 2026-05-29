/**
 * LSG-REF01+ — exhaustive edge cases for 0.6.0 refactor modules:
 * shared/, scan/, audit splits, block-tool-args-matcher, version, ./audit export.
 */
import { execFileSync, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
	applyStrict,
	countStaticErrors,
	formatStaticScanReport,
} from "../src/audit/format-report.js";
import { loadPoliciesForScan } from "../src/audit/load-policies.js";
import { resolveManifestFiles } from "../src/audit/resolve-manifests.js";
import { staticScanToSarif } from "../src/audit/sarif.js";
import { runStaticScan } from "../src/audit/static-scan.js";
import type { StaticScanReport } from "../src/audit/types.js";
import { compilePolicy } from "../src/policy/compile.js";
import {
	blockToolArgsMatcherFromParams,
	matchesBlockToolArgs,
} from "../src/policy/block-tool-args-matcher.js";
import { loadPolicy } from "../src/policy/load.js";
import { scanContent, scanPaths } from "../src/scan/runner.js";
import { normalizeSseToBytes, normalizeSseText } from "../src/scan/sse-normalize.js";
import { buildScanReport } from "../src/scan/types.js";
import { annotateFinding } from "../src/shared/github-annotation.js";
import { parseArgs, splitCommaList } from "../src/shared/parse-args.js";
import { parseStructuredText, readStructuredFile } from "../src/shared/structured-file.js";
import {
	DEFAULT_SKIP_DIRS,
	isManifestPath,
	walkFiles,
	walkManifestFiles,
} from "../src/shared/walk.js";
import { PACKAGE_VERSION } from "../src/version.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");

function tempDir(prefix = "lsg-ref-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function runCli(args: string[], env?: NodeJS.ProcessEnv) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0", ...env },
	});
}

function emptyReport(overrides?: Partial<StaticScanReport["summary"]>): StaticScanReport {
	return {
		summary: {
			manifests: 0,
			toolsDeclared: 0,
			drift: 0,
			dangerous: 0,
			blockToolArgs: 0,
			mode: "audit",
			...overrides,
		},
		drift: [],
		dangerous: [],
		blockToolArgs: [],
	};
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-REF01: shared parseArgs", () => {
	it("returns empty flags and rest for empty argv", () => {
		expect(parseArgs([])).toEqual({ flags: {}, rest: [] });
	});

	it("parses --help and -h", () => {
		expect(parseArgs(["--help"]).flags.help).toBe(true);
		expect(parseArgs(["-h"]).flags.help).toBe(true);
	});

	it("parses boolean flags without consuming next token", () => {
		const { flags, rest } = parseArgs(["--json", "--check", "scan"]);
		expect(flags.json).toBe(true);
		expect(flags.check).toBe(true);
		expect(rest).toEqual(["scan"]);
	});

	it("parses key=value style flags", () => {
		const { flags } = parseArgs(["scan", "--policy", "p.json", "--mode", "audit", "a.txt"]);
		expect(flags.policy).toBe("p.json");
		expect(flags.mode).toBe("audit");
	});

	it("treats bare --flag as boolean true when no value follows", () => {
		const { flags } = parseArgs(["audit", "static", "--strict", "--json"]);
		expect(flags.strict).toBe(true);
		expect(flags.json).toBe(true);
	});

	it("does not treat next --token as flag value", () => {
		const { flags } = parseArgs(["--policy", "--strict"]);
		expect(flags.policy).toBe(true);
		expect(flags.strict).toBe(true);
	});
});

describe("LSG-REF02: splitCommaList", () => {
	it("returns undefined for boolean and empty string", () => {
		expect(splitCommaList(undefined)).toBeUndefined();
		expect(splitCommaList(true)).toBeUndefined();
		expect(splitCommaList("")).toBeUndefined();
	});

	it("trims and filters empty segments", () => {
		expect(splitCommaList(" a , , b ,c ")).toEqual(["a", "b", "c"]);
	});
});

describe("LSG-REF03: isManifestPath", () => {
	const positive = [
		"tools/manifest.json",
		"apps/foo/tools/manifest.json",
		"agent.tools.yaml",
		"pkg/agent.tools.yml",
		"apps/tools/extra.json",
		"my-tools-config.json",
	];
	const negative = [
		"README.md",
		"src/index.ts",
		"tools/readme.txt",
		"manifest.json",
		"config.json",
	];

	for (const p of positive) {
		it(`matches manifest path: ${p}`, () => {
			expect(isManifestPath(p)).toBe(true);
		});
	}
	for (const p of negative) {
		it(`rejects non-manifest path: ${p}`, () => {
			expect(isManifestPath(p)).toBe(false);
		});
	}
});

describe("LSG-REF04: walkFiles", () => {
	it("skips DEFAULT_SKIP_DIRS", () => {
		const dir = tempDir("walk-skip-");
		mkdirSync(join(dir, "node_modules"));
		mkdirSync(join(dir, "dist"));
		writeFileSync(join(dir, "node_modules", "hidden.txt"), "x");
		writeFileSync(join(dir, "dist", "bundle.js"), "x");
		writeFileSync(join(dir, "visible.txt"), "x");
		const files = walkFiles([dir]);
		expect(files.some((f) => f.includes("node_modules"))).toBe(false);
		expect(files.some((f) => f.includes("dist"))).toBe(false);
		expect(files.some((f) => f.endsWith("visible.txt"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("ignores missing paths silently", () => {
		expect(walkFiles([join(tmpdir(), "lsg-nonexistent-walk-xyz")])).toEqual([]);
	});

	it("collects nested files", () => {
		const dir = tempDir("walk-nested-");
		mkdirSync(join(dir, "a", "b"), { recursive: true });
		writeFileSync(join(dir, "a", "b", "leaf.txt"), "x");
		expect(walkFiles([dir]).some((f) => f.endsWith("leaf.txt"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns single file when path is a file", () => {
		const dir = tempDir("walk-file-");
		const file = join(dir, "one.txt");
		writeFileSync(file, "x");
		expect(walkFiles([file])).toEqual([file]);
		rmSync(dir, { recursive: true, force: true });
	});

	it("respects custom skipDirs", () => {
		const dir = tempDir("walk-custom-skip-");
		mkdirSync(join(dir, "skipme"));
		writeFileSync(join(dir, "skipme", "inner.txt"), "x");
		const files = walkFiles([dir], new Set(["skipme"]));
		expect(files).toHaveLength(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF05: walkManifestFiles filters", () => {
	it("finds nested tools/manifest.json", () => {
		const dir = tempDir("walk-mf-");
		const toolsDir = join(dir, "apps", "agent", "tools");
		mkdirSync(toolsDir, { recursive: true });
		writeFileSync(join(toolsDir, "manifest.json"), "{}");
		const found = walkManifestFiles({ root: dir });
		expect(found.some((f) => f.endsWith("manifest.json"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("exclude prefix removes subtree", () => {
		const dir = tempDir("walk-excl-");
		mkdirSync(join(dir, "keep", "tools"), { recursive: true });
		mkdirSync(join(dir, "drop", "tools"), { recursive: true });
		writeFileSync(join(dir, "keep", "tools", "manifest.json"), "{}");
		writeFileSync(join(dir, "drop", "tools", "manifest.json"), "{}");
		const found = walkManifestFiles({ root: dir, exclude: ["drop"] });
		expect(found.some((f) => f.includes("drop"))).toBe(false);
		expect(found.some((f) => f.includes("keep"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("include descends into parent when child prefix listed", () => {
		const dir = tempDir("walk-incl-");
		mkdirSync(join(dir, "apps", "agent", "tools"), { recursive: true });
		mkdirSync(join(dir, "apps", "other", "tools"), { recursive: true });
		writeFileSync(join(dir, "apps", "agent", "tools", "manifest.json"), "{}");
		writeFileSync(join(dir, "apps", "other", "tools", "manifest.json"), "{}");
		const found = walkManifestFiles({ root: dir, include: ["apps/agent"] });
		expect(found).toHaveLength(1);
		expect(found[0]).toContain("apps/agent");
		rmSync(dir, { recursive: true, force: true });
	});

	it("returns sorted paths", () => {
		const dir = tempDir("walk-sort-");
		mkdirSync(join(dir, "b", "tools"), { recursive: true });
		mkdirSync(join(dir, "a", "tools"), { recursive: true });
		writeFileSync(join(dir, "b", "tools", "manifest.json"), "{}");
		writeFileSync(join(dir, "a", "tools", "manifest.json"), "{}");
		const found = walkManifestFiles({ root: dir });
		expect(found).toEqual([...found].sort());
		rmSync(dir, { recursive: true, force: true });
	});

	it("handles unreadable root gracefully", () => {
		expect(walkManifestFiles({ root: join(tmpdir(), "lsg-no-root-xyz") })).toEqual([]);
	});
});

describe("LSG-REF06: structured file reader", () => {
	it("reads JSON policy fixture", () => {
		const path = join(rootDir, "test/fixtures/policies/valid/minimal.json");
		const doc = readStructuredFile(path) as { version?: string };
		expect(doc.version).toBe("1");
	});

	it("reads YAML via parseStructuredText", () => {
		const yaml = 'version: "1"\ntools:\n  - name: yaml_tool\n';
		const doc = parseStructuredText(yaml, "manifest.yaml") as {
			version?: string;
			tools?: Array<{ name: string }>;
		};
		expect(doc.version).toBe("1");
		expect(doc.tools?.[0]?.name).toBe("yaml_tool");
	});

	it("throws on invalid JSON text", () => {
		expect(() => parseStructuredText("{bad", "x.json")).toThrow();
	});
});

describe("LSG-REF07: blockToolArgsMatcher", () => {
	it("builds pattern matcher", () => {
		const m = blockToolArgsMatcherFromParams({ pattern: "rm\\s+-rf" });
		expect(m?.pattern?.test("rm -rf /")).toBe(true);
	});

	it("builds contains matcher", () => {
		const m = blockToolArgsMatcherFromParams({ contains: "DROP TABLE" });
		expect(m?.contains).toBe("DROP TABLE");
	});

	it("returns null when params empty", () => {
		expect(blockToolArgsMatcherFromParams({})).toBeNull();
		expect(blockToolArgsMatcherFromParams({ pattern: 1 })).toBeNull();
	});

	it("pattern takes precedence when both pattern and contains present", () => {
		const m = blockToolArgsMatcherFromParams({ pattern: "abc", contains: "xyz" });
		expect(m?.pattern).toBeDefined();
		expect(m?.contains).toBeUndefined();
	});

	it("matchesBlockToolArgs short-circuits on first hit", () => {
		const matchers = [{ contains: "miss" }, { contains: "hit" }, { contains: "never" }];
		expect(matchesBlockToolArgs("prefix hit suffix", matchers)).toBe(true);
		expect(matchesBlockToolArgs("clean", matchers)).toBe(false);
		expect(matchesBlockToolArgs("anything", [])).toBe(false);
	});
});

describe("LSG-REF08: compilePolicy blockToolArgs guard", () => {
	it("throws when blockToolArgs has neither pattern nor contains", () => {
		expect(() =>
			compilePolicy({
				version: "1",
				rules: [{ blockToolArgs: {} as Record<string, unknown> }],
			}),
		).toThrow(/blockToolArgs requires pattern or contains/);
	});
});

describe("LSG-REF09: loadPoliciesForScan", () => {
	it("loads single policy with label basename", () => {
		const entries = loadPoliciesForScan({
			root: rootDir,
			policy: join(rootDir, "policies/agent-gate.json"),
		});
		expect(entries).toHaveLength(1);
		expect(entries[0]?.label).toBe("agent-gate.json");
		expect(entries[0]?.sets.allow.size).toBeGreaterThan(0);
	});

	it("loads sorted policyDir entries", () => {
		const dir = tempDir("pol-dir-");
		writeFileSync(join(dir, "z-policy.json"), JSON.stringify({ version: "1", rules: [] }));
		writeFileSync(join(dir, "a-policy.json"), JSON.stringify({ version: "1", rules: [] }));
		const entries = loadPoliciesForScan({ root: dir, policyDir: dir });
		expect(entries.map((e) => e.label)).toEqual(["a-policy.json", "z-policy.json"]);
		rmSync(dir, { recursive: true, force: true });
	});

	it("throws when policyDir missing", () => {
		expect(() =>
			loadPoliciesForScan({ root: rootDir, policyDir: join(tmpdir(), "lsg-no-pol-dir") }),
		).toThrow();
	});

	it("combines --policy and --policy-dir", () => {
		const dir = tempDir("pol-combo-");
		writeFileSync(join(dir, "extra.json"), JSON.stringify({ version: "1", rules: [] }));
		const entries = loadPoliciesForScan({
			root: rootDir,
			policy: join(rootDir, "policies/agent-gate.json"),
			policyDir: dir,
		});
		expect(entries).toHaveLength(2);
		rmSync(dir, { recursive: true, force: true });
	});

	it("uses policyVersion when present", () => {
		const dir = tempDir("pol-ver-");
		writeFileSync(
			join(dir, "v.json"),
			JSON.stringify({ version: "1", policyVersion: "gate-v2", rules: [] }),
		);
		const entries = loadPoliciesForScan({ root: dir, policy: join(dir, "v.json") });
		expect(entries[0]?.version).toBe("gate-v2");
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF10: resolveManifestFiles", () => {
	it("returns explicit manifest when file exists", () => {
		const path = join(rootDir, "tools/manifest.json");
		expect(resolveManifestFiles({ root: rootDir, manifest: path })).toEqual([path]);
	});

	it("returns empty when manifest path missing", () => {
		expect(
			resolveManifestFiles({
				root: rootDir,
				manifest: join(tmpdir(), "lsg-missing-manifest.json"),
			}),
		).toEqual([]);
	});

	it("walks root when manifest omitted", () => {
		const dir = tempDir("resolve-walk-");
		mkdirSync(join(dir, "tools"), { recursive: true });
		writeFileSync(
			join(dir, "tools", "manifest.json"),
			JSON.stringify({ version: "1", tools: [{ name: "t" }] }),
		);
		const files = resolveManifestFiles({
			root: dir,
			policy: join(rootDir, "policies/agent-gate.json"),
		});
		expect(files.some((f) => f.endsWith("manifest.json"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF11: format-report helpers", () => {
	it("applyStrict upgrades DRIFT_POLICY_ONLY to error", () => {
		const drift = [
			{
				code: "DRIFT_POLICY_ONLY" as const,
				severity: "warning" as const,
				tool: "x",
				file: "m.json",
				message: "only in policy",
			},
		];
		const strict = applyStrict(drift, true);
		expect(strict[0]?.severity).toBe("error");
		expect(applyStrict(drift, false)[0]?.severity).toBe("warning");
	});

	it("countStaticErrors respects strict dangerous count", () => {
		const report = emptyReport();
		report.drift.push({
			code: "DRIFT_MANIFEST_ONLY",
			severity: "error",
			tool: "a",
			file: "m.json",
			message: "x",
		});
		report.dangerous.push({
			code: "D001",
			severity: "error",
			field: "desc",
			file: "m.json",
			message: "y",
		});
		expect(countStaticErrors(report, false)).toBe(1);
		expect(countStaticErrors(report, true)).toBe(2);
	});

	it("formatStaticScanReport quiet hides warnings", () => {
		const report = emptyReport({ manifests: 1, toolsDeclared: 1 });
		report.drift.push({
			code: "DRIFT_POLICY_ONLY",
			severity: "warning",
			tool: "w",
			file: "m.json",
			message: "warn",
		});
		report.drift.push({
			code: "DRIFT_MANIFEST_ONLY",
			severity: "error",
			tool: "e",
			file: "m.json",
			message: "err",
		});
		const quiet = formatStaticScanReport(report, true);
		expect(quiet).toContain("DRIFT_MANIFEST_ONLY");
		expect(quiet).not.toContain("DRIFT_POLICY_ONLY");
	});

	it("formatStaticScanReport empty non-quiet says No findings", () => {
		const out = formatStaticScanReport(emptyReport({ manifests: 2, toolsDeclared: 3 }), false);
		expect(out).toContain("2 manifest");
		expect(out).toContain("No findings.");
	});
});

describe("LSG-REF12: scan types and runner", () => {
	it("buildScanReport omits policyVersion when undefined", () => {
		const report = buildScanReport({ mode: "block" }, [], 0, 0);
		expect(report.summary.policyVersion).toBeUndefined();
		expect(report.summary.mode).toBe("block");
	});

	it("scanPaths aggregates violations across files", async () => {
		const dir = tempDir("scan-paths-");
		const bad = join(dir, "bad.json");
		writeFileSync(
			bad,
			JSON.stringify([{ type: "tool_call", phase: "done", name: "bash", id: "1" }]),
		);
		const policy = loadPolicy(join(rootDir, "policies/agent-gate.json"));
		const report = await scanPaths([bad], policy);
		expect(report.summary.files).toBe(1);
		expect(report.summary.violations).toBeGreaterThan(0);
		rmSync(dir, { recursive: true, force: true });
	});

	it("scanContent honors stdinFormat override on extension mismatch", async () => {
		const policy = loadPolicy(join(rootDir, "policies/audit-only.json"));
		const sse = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const result = await scanContent("plain.txt", sse, policy, { stdinFormat: "sse", ext: ".txt" });
		expect(result.redactions).toBeGreaterThan(0);
	});

	it("scanContent treats .json extension as text when content is not JSON", async () => {
		const policy = loadPolicy(join(rootDir, "policies/audit-only.json"));
		const result = await scanContent("notes.json", "plain text not json", policy, { ext: ".json" });
		expect(result.skipped).toBe(false);
		expect(result.violations).toHaveLength(0);
	});
});

describe("LSG-REF13: SSE normalize edge cases", () => {
	it("strips CRLF and comment lines", () => {
		const input = ": comment\r\ndata: hello\r\n\r\ndata: world\r\n";
		expect(normalizeSseText(input)).toBe("hello\nworld");
	});

	it("preserves data: without space after colon", () => {
		expect(normalizeSseText("data:payload")).toBe("payload");
	});

	it("strips single space after data:", () => {
		expect(normalizeSseText("data: spaced")).toBe("spaced");
	});

	it("passes through non-data lines", () => {
		const bytes = normalizeSseToBytes("event: ping\nid: 1\nraw line");
		expect(new TextDecoder().decode(bytes)).toContain("event: ping");
	});
});

describe("LSG-REF14: github-annotation", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("emits error annotation with default line 1", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		annotateFinding({ file: "a.json", message: "bad", severity: "error" });
		expect(spy).toHaveBeenCalledWith("::error file=a.json,line=1::bad");
	});

	it("emits warning annotation with explicit line", () => {
		const spy = vi.spyOn(console, "log").mockImplementation(() => {});
		annotateFinding({ file: "b.yaml", line: 9, message: "warn", severity: "warning" });
		expect(spy).toHaveBeenCalledWith("::warning file=b.yaml,line=9::warn");
	});
});

describe("LSG-REF15: PACKAGE_VERSION and SARIF", () => {
	it("matches package.json version", () => {
		const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
			version: string;
		};
		expect(PACKAGE_VERSION).toBe(pkg.version);
	});

	it("SARIF driver version falls back to PACKAGE_VERSION", () => {
		const sarif = staticScanToSarif(emptyReport()) as {
			runs: Array<{ tool: { driver: { version: string } } }>;
		};
		expect(sarif.runs[0]?.tool.driver.version).toBe(PACKAGE_VERSION);
	});

	it("SARIF uses policyVersion when set", () => {
		const sarif = staticScanToSarif(emptyReport({ policyVersion: "custom-gate" })) as {
			runs: Array<{ tool: { driver: { version: string } } }>;
		};
		expect(sarif.runs[0]?.tool.driver.version).toBe("custom-gate");
	});
});

describe("LSG-REF16: audit package export surface", () => {
	it("loads runStaticScan and walkManifestFiles from audit index", async () => {
		const audit = (await import(join(rootDir, "dist/audit/index.js"))) as {
			runStaticScan: typeof runStaticScan;
			walkManifestFiles: typeof walkManifestFiles;
			loadPoliciesForScan: typeof loadPoliciesForScan;
		};
		expect(typeof audit.runStaticScan).toBe("function");
		expect(typeof audit.walkManifestFiles).toBe("function");
		expect(typeof audit.loadPoliciesForScan).toBe("function");
	});
});

describe("LSG-REF17: DEFAULT_SKIP_DIRS", () => {
	it("includes expected directory names", () => {
		for (const name of ["node_modules", ".git", "dist", "coverage", ".pnpm-store"]) {
			expect(DEFAULT_SKIP_DIRS.has(name)).toBe(true);
		}
	});
});

describe("LSG-REF18: static scan integration via refactored modules", () => {
	it("invalid policy in policyDir fails during loadPoliciesForScan path", () => {
		expect(() =>
			runStaticScan({
				root: rootDir,
				policyDir: join(rootDir, "test/fixtures/policies/invalid"),
			}),
		).toThrow();
	});

	it("runStaticScan uses resolveManifestFiles walk + loadPoliciesForScan", () => {
		const dir = tempDir("ref-static-");
		mkdirSync(join(dir, "tools"), { recursive: true });
		writeFileSync(
			join(dir, "tools", "manifest.json"),
			JSON.stringify({ version: "1", tools: [{ name: "search" }] }),
		);
		const report = runStaticScan({
			root: dir,
			policy: join(rootDir, "policies/agent-gate.json"),
		});
		expect(report.summary.manifests).toBe(1);
		expect(report.summary.toolsDeclared).toBe(1);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF19: CLI refactor command routing", () => {
	it("resolve prints merged policy document", () => {
		const r = runCli(["resolve", "policies/agent-gate.json", "--json"]);
		expect(r.status).toBe(0);
		const doc = JSON.parse(r.stdout);
		expect(doc.version).toBe("1");
		expect(Array.isArray(doc.rules)).toBe(true);
	});

	it("profiles list --json returns array", () => {
		const r = runCli(["profiles", "list", "--json"]);
		expect(r.status).toBe(0);
		expect(Array.isArray(JSON.parse(r.stdout))).toBe(true);
	});

	it("audit validate-manifest ok manifest exits 0", () => {
		const r = runCli(["audit", "validate-manifest", "--manifest", "tools/manifest.json"]);
		expect(r.status).toBe(0);
	});

	it("unknown top-level command exits usage code", () => {
		const r = runCli(["not-a-command"]);
		expect(r.status).toBe(2);
		expect(r.stderr).toMatch(/Unknown command/);
	});
});

describe("LSG-REF20: walkFiles symlink and mixed tree", () => {
	const canSymlink = (() => {
		try {
			const dir = tempDir("symlink-probe-");
			const target = join(dir, "t");
			mkdirSync(target);
			symlinkSync(target, join(dir, "l"));
			rmSync(dir, { recursive: true, force: true });
			return true;
		} catch {
			return false;
		}
	})();

	it.skipIf(!canSymlink)("walks through symlinked subdirectory when target not skipped", () => {
		const dir = tempDir("walk-symlink-");
		const real = join(dir, "real");
		mkdirSync(real);
		writeFileSync(join(real, "inside.txt"), "x");
		symlinkSync(real, join(dir, "link"));
		const files = walkFiles([join(dir, "link")]);
		expect(files.some((f) => f.endsWith("inside.txt"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF21: parseArgs rest preservation", () => {
	it("keeps positional args after flags", () => {
		const { rest } = parseArgs([
			"scan",
			"--policy",
			"p.json",
			"--json",
			"file-a.json",
			"file-b.json",
		]);
		expect(rest).toEqual(["scan", "file-a.json", "file-b.json"]);
	});
});

describe("LSG-REF22: blockToolArgs via compile + extract roundtrip", () => {
	it("compiled policy blockToolArgs matchers work in static scan path", () => {
		const dir = tempDir("ref-block-args-");
		writeFileSync(
			join(dir, "policy.json"),
			JSON.stringify({
				version: "1",
				rules: [{ blockToolArgs: { contains: "curl http://169.254.169.254" } }],
			}),
		);
		mkdirSync(join(dir, "tools"), { recursive: true });
		writeFileSync(
			join(dir, "tools", "manifest.json"),
			JSON.stringify({
				version: "1",
				tools: [
					{
						name: "fetch",
						description: "curl http://169.254.169.254/metadata",
					},
				],
			}),
		);
		const report = runStaticScan({ root: dir, policy: join(dir, "policy.json") });
		expect(report.blockToolArgs.length).toBeGreaterThan(0);
		rmSync(dir, { recursive: true, force: true });
	});
});

describe("LSG-REF23: formatStaticScanReport blockToolArgs and dangerous lines", () => {
	it("includes blockToolArgs and dangerous finding formats", () => {
		const report = emptyReport({ manifests: 1, toolsDeclared: 1 });
		report.dangerous.push({
			code: "D002",
			severity: "error",
			field: "examples",
			file: "m.json",
			message: "dangerous",
		});
		report.blockToolArgs.push({
			code: "BLOCK_ARGS_STATIC",
			severity: "error",
			field: "description",
			file: "m.json",
			message: "blocked",
		});
		const out = formatStaticScanReport(report, false);
		expect(out).toContain("D002");
		expect(out).toContain("BLOCK_ARGS_STATIC");
	});
});

describe("LSG-REF24: scanContent jsonl blank lines", () => {
	it("ignores empty lines in jsonl", async () => {
		const policy = loadPolicy(join(rootDir, "policies/agent-gate.json"));
		const jsonl = '\n\n{"type":"tool_call","phase":"done","name":"bash","id":"1"}\n\n';
		const result = await scanContent("e.jsonl", jsonl, policy, { ext: ".jsonl" });
		expect(result.violations.length).toBeGreaterThan(0);
	});
});

describe("LSG-REF25: walkManifestFiles agent.tools.yaml", () => {
	it("discovers agent.tools.yaml at repo root relative path", () => {
		const dir = tempDir("walk-yaml-");
		writeFileSync(join(dir, "agent.tools.yaml"), 'version: "1"\ntools:\n  - name: yaml_tool\n');
		const found = walkManifestFiles({ root: dir });
		expect(found.some((f) => f.endsWith("agent.tools.yaml"))).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});
});
