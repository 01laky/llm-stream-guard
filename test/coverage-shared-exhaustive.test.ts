/**
 * LSG-COV131–COV150 — shared walk/parse-args/structured-file/github-annotation coverage.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { annotateFinding } from "../src/shared/github-annotation.js";
import { parseArgs, splitCommaList } from "../src/shared/parse-args.js";
import { readStructuredFile } from "../src/shared/structured-file.js";
import { isManifestPath, walkFiles, walkManifestFiles } from "../src/shared/walk.js";

const MANIFEST_PATH_TABLE: Array<{ rel: string; expect: boolean }> = [
	{ rel: "tools/manifest.json", expect: true },
	{ rel: "apps/foo/tools/manifest.json", expect: true },
	{ rel: "agent.tools.yaml", expect: true },
	{ rel: "pkg/agent.tools.yml", expect: true },
	{ rel: "apps/tools/extra.json", expect: true },
	{ rel: "my-tools-config.json", expect: true },
	{ rel: "deep/nested/tools/custom-tools.json", expect: true },
	{ rel: "services/agent/tools/registry.json", expect: true },
	{ rel: "README.md", expect: false },
	{ rel: "src/index.ts", expect: false },
	{ rel: "tools/readme.txt", expect: false },
	{ rel: "manifest.json", expect: false },
	{ rel: "config.json", expect: false },
	{ rel: "package.json", expect: false },
	{ rel: "vendor/tools-only.dat", expect: false },
];

function tempDir(prefix = "lsg-cov-shared-"): string {
	return mkdtempSync(join(tmpdir(), prefix));
}

function buildWalkTree(): string {
	const dir = tempDir("walk-tree-");
	mkdirSync(join(dir, "apps", "agent", "tools"), { recursive: true });
	mkdirSync(join(dir, "apps", "other", "tools"), { recursive: true });
	mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
	writeFileSync(join(dir, "visible.txt"), "x");
	writeFileSync(join(dir, "apps", "agent", "tools", "manifest.json"), "{}");
	writeFileSync(join(dir, "apps", "other", "tools", "manifest.json"), "{}");
	writeFileSync(join(dir, "agent.tools.yaml"), 'version: "1"\n');
	writeFileSync(join(dir, "node_modules", "pkg", "hidden.txt"), "x");
	return dir;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("LSG-COV131: isManifestPath tools/manifest.json", () => {
	it("matches canonical path", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[0]!.rel)).toBe(MANIFEST_PATH_TABLE[0]!.expect);
	});
});

describe("LSG-COV132: isManifestPath nested manifest.json", () => {
	it("matches apps/foo/tools/manifest.json", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[1]!.rel)).toBe(MANIFEST_PATH_TABLE[1]!.expect);
	});
});

describe("LSG-COV133: isManifestPath agent.tools.yaml", () => {
	it("matches yaml agent tools file", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[2]!.rel)).toBe(MANIFEST_PATH_TABLE[2]!.expect);
	});
});

describe("LSG-COV134: isManifestPath agent.tools.yml", () => {
	it("matches yml suffix", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[3]!.rel)).toBe(MANIFEST_PATH_TABLE[3]!.expect);
	});
});

describe("LSG-COV135: isManifestPath tools/*.json", () => {
	it("matches apps/tools/extra.json", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[4]!.rel)).toBe(MANIFEST_PATH_TABLE[4]!.expect);
	});
});

describe("LSG-COV136: isManifestPath my-tools-config.json", () => {
	it("matches tools substring json heuristic", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[5]!.rel)).toBe(MANIFEST_PATH_TABLE[5]!.expect);
	});
});

describe("LSG-COV137: isManifestPath deep nested tools json", () => {
	it("matches deep/nested/tools/custom-tools.json", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[6]!.rel)).toBe(MANIFEST_PATH_TABLE[6]!.expect);
	});
});

describe("LSG-COV138: isManifestPath services registry", () => {
	it("matches services/agent/tools/registry.json", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[7]!.rel)).toBe(MANIFEST_PATH_TABLE[7]!.expect);
	});
});

describe("LSG-COV139: isManifestPath rejects README", () => {
	it("returns false for README.md", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[8]!.rel)).toBe(MANIFEST_PATH_TABLE[8]!.expect);
	});
});

describe("LSG-COV140: isManifestPath rejects src/index.ts", () => {
	it("returns false for TypeScript source", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[9]!.rel)).toBe(MANIFEST_PATH_TABLE[9]!.expect);
	});
});

describe("LSG-COV141: isManifestPath rejects tools/readme.txt", () => {
	it("returns false for non-json yaml under tools", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[10]!.rel)).toBe(MANIFEST_PATH_TABLE[10]!.expect);
	});
});

describe("LSG-COV142: isManifestPath rejects bare manifest.json", () => {
	it("returns false without tools directory segment", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[11]!.rel)).toBe(MANIFEST_PATH_TABLE[11]!.expect);
	});
});

describe("LSG-COV143: isManifestPath rejects config.json", () => {
	it("returns false without tools in path", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[12]!.rel)).toBe(MANIFEST_PATH_TABLE[12]!.expect);
	});
});

describe("LSG-COV144: isManifestPath rejects package.json", () => {
	it("returns false for package manifest name collision", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[13]!.rel)).toBe(MANIFEST_PATH_TABLE[13]!.expect);
	});
});

describe("LSG-COV145: isManifestPath rejects vendor tools dat", () => {
	it("returns false for non-json yaml tools path", () => {
		expect(isManifestPath(MANIFEST_PATH_TABLE[14]!.rel)).toBe(MANIFEST_PATH_TABLE[14]!.expect);
	});
});

describe("LSG-COV146: walkFiles skipDirs", () => {
	it("skips DEFAULT_SKIP_DIRS including node_modules", () => {
		const dir = buildWalkTree();
		try {
			const files = walkFiles([dir]);
			expect(files.some((f) => f.includes("node_modules"))).toBe(false);
			expect(files.some((f) => f.endsWith("visible.txt"))).toBe(true);
			const custom = walkFiles([dir], new Set(["node_modules", "apps"]));
			expect(custom.some((f) => f.includes("apps"))).toBe(false);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV147: walkManifestFiles exclude wins", () => {
	it("exclude prefix removes manifests under apps/other", () => {
		const dir = buildWalkTree();
		try {
			const all = walkManifestFiles({ root: dir });
			const filtered = walkManifestFiles({
				root: dir,
				include: ["apps"],
				exclude: ["apps/other"],
			});
			expect(all.length).toBeGreaterThan(filtered.length);
			expect(filtered.every((f) => !f.includes("apps/other"))).toBe(true);
			expect(filtered.some((f) => f.includes("apps/agent"))).toBe(true);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV148: walkManifestFiles include filter", () => {
	it("include prefix limits manifest discovery", () => {
		const dir = buildWalkTree();
		try {
			const onlyAgent = walkManifestFiles({ root: dir, include: ["apps/agent"] });
			expect(onlyAgent).toHaveLength(1);
			expect(onlyAgent[0]).toContain("apps/agent/tools/manifest.json");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("LSG-COV149: parseArgs all flags", () => {
	it("parses help json check stdin policy mode and rest", () => {
		const { flags, rest } = parseArgs([
			"scan",
			"--help",
			"-h",
			"--json",
			"--check",
			"--stdin",
			"--policy",
			"p.json",
			"--mode",
			"audit",
			"--strict",
			"--include",
			"a,b",
			"file.json",
		]);
		expect(flags.help).toBe(true);
		expect(flags.json).toBe(true);
		expect(flags.check).toBe(true);
		expect(flags.stdin).toBe(true);
		expect(flags.policy).toBe("p.json");
		expect(flags.mode).toBe("audit");
		expect(flags.strict).toBe(true);
		expect(flags.include).toBe("a,b");
		expect(rest).toEqual(["scan", "file.json"]);
		expect(splitCommaList(flags.include)).toEqual(["a", "b"]);
	});
});

describe("LSG-COV150: bare policy EOF structured annotate", () => {
	it("bare --policy is boolean; invalid structured files throw; annotate severity", () => {
		const eof = parseArgs(["scan", "--policy"]);
		expect(eof.flags.policy).toBe(true);
		expect(eof.rest).toEqual(["scan"]);

		const dir = tempDir("structured-");
		const badJson = join(dir, "bad.json");
		const badYaml = join(dir, "bad.yaml");
		writeFileSync(badJson, "{not json");
		writeFileSync(badYaml, "version: [\n  &anchor duplicated\n");
		expect(() => readStructuredFile(badJson)).toThrow();
		expect(() => readStructuredFile(badYaml)).toThrow(/anchors|YAML|parse/i);
		rmSync(dir, { recursive: true, force: true });

		const logs: string[] = [];
		vi.spyOn(console, "log").mockImplementation((msg) => {
			logs.push(String(msg));
		});
		annotateFinding({
			file: "f.json",
			line: 4,
			message: "err",
			severity: "error",
		});
		annotateFinding({
			file: "f.json",
			message: "warn",
			severity: "warning",
		});
		expect(logs[0]).toMatch(/^::error file=f\.json,line=4::/);
		expect(logs[1]).toMatch(/^::warning file=f\.json,line=1::/);
	});
});
