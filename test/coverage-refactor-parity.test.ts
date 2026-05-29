/**
 * LSG-COV166–COV175 — refactor module parity: cli vs shared/scan re-exports,
 * audit export surface, CLI scan smoke.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import {
	isManifestPath as auditIsManifestPath,
	walkFiles as auditWalkFiles,
	walkManifestFiles as auditWalkManifestFiles,
} from "../src/audit/index.js";
import { isManifestPath as filtersIsManifestPath } from "../src/audit/walk-filters.js";
import { walkFiles as cliWalkFiles } from "../src/cli/walk.js";
import { scanContent as cliScanContent } from "../src/cli/scan-runner.js";
import { normalizeSseToBytes as cliNormalizeSseToBytes } from "../src/cli/sse-normalize.js";
import { loadPolicy } from "../src/policy/load.js";
import { scanContent as scanScanContent } from "../src/scan/runner.js";
import { normalizeSseToBytes as scanNormalizeSseToBytes } from "../src/scan/sse-normalize.js";
import {
	isManifestPath as sharedIsManifestPath,
	walkFiles as sharedWalkFiles,
	walkManifestFiles as sharedWalkManifestFiles,
} from "../src/shared/walk.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const cliPath = join(rootDir, "dist/cli.js");
const auditIndexSource = readFileSync(join(rootDir, "src/audit/index.ts"), "utf8");
const staticScanSource = readFileSync(join(rootDir, "src/audit/static-scan.ts"), "utf8");
const scanCommandSource = readFileSync(join(rootDir, "src/cli/commands/scan.ts"), "utf8");

function tempDir(prefix = "lsg-cov-parity-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function buildWalkTree(): string {
	const dir = tempDir("walk-tree-");
	mkdirSync(join(dir, "apps", "agent", "tools"), { recursive: true });
	mkdirSync(join(dir, "apps", "other", "tools"), { recursive: true });
	mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
	mkdirSync(join(dir, "skip", "inner"), { recursive: true });
	writeFileSync(join(dir, "visible.txt"), "x");
	writeFileSync(join(dir, "apps", "agent", "tools", "manifest.json"), "{}");
	writeFileSync(join(dir, "apps", "other", "tools", "manifest.json"), "{}");
	writeFileSync(join(dir, "agent.tools.yaml"), 'version: "1"\ntools:\n  - name: y\n');
	writeFileSync(join(dir, "node_modules", "pkg", "hidden.txt"), "x");
	writeFileSync(join(dir, "skip", "inner", "leaf.txt"), "x");
	return dir;
}

function runCli(args: string[]) {
	return spawnSync(process.execPath, [cliPath, ...args], {
		cwd: rootDir,
		encoding: "utf8",
		env: { ...process.env, FORCE_COLOR: "0" },
	});
}

function exportNamesFromAuditIndex(source: string): string[] {
	const names = new Set<string>();
	for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
		for (const part of block[1]!.split(",")) {
			const m = part.trim().match(/(?:type\s+)?(\w+)/);
			if (m) names.add(m[1]!);
		}
	}
	return [...names].sort();
}

beforeAll(() => {
	if (!existsSync(cliPath)) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-COV166: walkFiles cli vs shared parity", () => {
	it("returns identical sorted file lists on temp tree", () => {
		const dir = buildWalkTree();
		try {
			const fromCli = [...cliWalkFiles([dir])].sort();
			const fromShared = [...sharedWalkFiles([dir])].sort();
			expect(fromCli).toEqual(fromShared);
			expect(fromCli.some((f) => f.endsWith("visible.txt"))).toBe(true);
			expect(fromCli.some((f) => f.includes("node_modules"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV167: walkManifestFiles audit filters vs shared", () => {
	it("returns identical manifest paths with include/exclude filters", () => {
		const dir = buildWalkTree();
		try {
			const opts = { root: dir, include: ["apps/agent"], exclude: ["apps/other"] };
			const fromAudit = auditWalkManifestFiles(opts);
			const fromShared = sharedWalkManifestFiles(opts);
			expect(fromAudit).toEqual(fromShared);
			expect(fromAudit.every((f) => f.includes("apps/agent"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV168: isManifestPath audit vs shared", () => {
	const paths = [
		"tools/manifest.json",
		"apps/foo/tools/manifest.json",
		"agent.tools.yaml",
		"pkg/agent.tools.yml",
		"apps/tools/extra.json",
		"my-tools-config.json",
		"README.md",
		"src/index.ts",
		"tools/readme.txt",
		"manifest.json",
		"config.json",
		"deep/nested/tools/custom-tools.json",
	];

	for (const p of paths) {
		it(`agrees on ${p}`, () => {
			expect(auditIsManifestPath(p)).toBe(sharedIsManifestPath(p));
			expect(filtersIsManifestPath(p)).toBe(sharedIsManifestPath(p));
		});
	}
});

describe("LSG-COV169: scanContent cli vs scan runner", () => {
	it("produces identical violation and redaction counts", async () => {
		const policy = loadPolicy(join(rootDir, "policies/audit-only.json"));
		const raw = readFileSync(join(rootDir, "test/fixtures/byte-sse/data-prefix-sk.sse"), "utf8");
		const cliResult = await cliScanContent("probe.sse", raw, policy, {
			stdinFormat: "sse",
			ext: ".sse",
		});
		const scanResult = await scanScanContent("probe.sse", raw, policy, {
			stdinFormat: "sse",
			ext: ".sse",
		});
		expect(cliResult.redactions).toBe(scanResult.redactions);
		expect(cliResult.violations.length).toBe(scanResult.violations.length);
		expect(cliResult.skipped).toBe(scanResult.skipped);
	});
});

describe("LSG-COV170: normalizeSseToBytes cli vs scan", () => {
	it("matches byte-for-byte on mixed SSE input", () => {
		const input = ": comment\r\ndata: hello\r\n\r\ndata: world\r\nevent: ping\nid: 1\n";
		const cliBytes = cliNormalizeSseToBytes(input);
		const scanBytes = scanNormalizeSseToBytes(input);
		expect(cliBytes).toEqual(scanBytes);
		expect(new TextDecoder().decode(cliBytes)).toBe("hello\nworld\nevent: ping\nid: 1");
	});
});

describe("LSG-COV171: audit index walk re-exports", () => {
	it("walkFiles and walkManifestFiles behave like shared module", () => {
		const dir = tempDir("audit-walk-");
		mkdirSync(join(dir, "tools"), { recursive: true });
		writeFileSync(join(dir, "tools", "manifest.json"), "{}");
		writeFileSync(join(dir, "note.txt"), "x");
		try {
			expect(auditWalkFiles([dir]).sort()).toEqual(sharedWalkFiles([dir]).sort());
			expect(auditWalkManifestFiles({ root: dir })).toEqual(sharedWalkManifestFiles({ root: dir }));
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV172: scan command uses scan runner", () => {
	it("imports scanPaths and scanStdin from scan/runner.js", () => {
		expect(scanCommandSource).toContain('from "../../scan/runner.js"');
		expect(scanCommandSource).toMatch(/scanPaths|scanStdin/);
	});
});

describe("LSG-COV173: CLI scan clean-tool exit 0", () => {
	it("scan on clean-tool.json exits 0 with agent-gate policy", () => {
		const r = runCli([
			"scan",
			"--policy",
			"policies/agent-gate.json",
			"test/fixtures/events/clean-tool.json",
		]);
		expect(r.status).toBe(0);
	});
});

describe("LSG-COV174: audit index exports in dist d.ts", () => {
	it("every src export name appears in dist/audit/index.d.ts", () => {
		const dts = readFileSync(join(rootDir, "dist/audit/index.d.ts"), "utf8");
		const expected = exportNamesFromAuditIndex(auditIndexSource);
		expect(expected.length).toBeGreaterThan(10);
		for (const name of expected) {
			expect(dts, `missing export ${name}`).toMatch(new RegExp(`\\b${name}\\b`));
		}
	});
});

describe("LSG-COV175: static-scan imports refactored modules", () => {
	it("static-scan.ts wires loadPoliciesForScan, resolveManifestFiles, and scanners", () => {
		expect(staticScanSource).toContain('from "./load-policies.js"');
		expect(staticScanSource).toContain("loadPoliciesForScan");
		expect(staticScanSource).toContain('from "./resolve-manifests.js"');
		expect(staticScanSource).toContain("resolveManifestFiles");
		expect(staticScanSource).toContain('from "./extract-tools.js"');
		expect(staticScanSource).toContain("parseManifestFile");
		expect(staticScanSource).toContain('from "./drift.js"');
		expect(staticScanSource).toContain("computeDrift");
		expect(staticScanSource).toContain('from "./dangerous-patterns.js"');
		expect(staticScanSource).toContain("scanDangerousStrings");
		expect(staticScanSource).toContain('from "./block-tool-args-static.js"');
		expect(staticScanSource).toContain("scanBlockToolArgsStatic");
		expect(staticScanSource).toContain('from "./format-report.js"');
	});
});
