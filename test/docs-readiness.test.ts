/**
 * LSG-DOC01–DOC35 — documentation completeness, link integrity, and release doc gates.
 * Extended edge cases: LSG-DOC-E09–E55 in docs-edge-cases.test.ts (DOC-E01–E08 below).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RULE_KEYS } from "../src/policy/rule-keys.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
	return readFileSync(join(rootDir, path), "utf8");
}

function pkgVersion(): string {
	return (JSON.parse(read("package.json")) as { version: string }).version;
}

const STATUS_SCAN_FILES = [
	"docs/comparison.md",
	"docs/pre-commit-recipe.md",
	"docs/migration-from-regex.md",
	"docs/mcp-tool-gate-recipe.md",
	"docs/litellm-gateway-hook.md",
	"docs/integration-cookbook.md",
	"docs/static-scanning.md",
	"docs/ci-github-action.md",
	"docs/faq.md",
	"docs/docs-map.md",
	"docs/troubleshooting.md",
	"docs/security-reporting.md",
	"docs/upgrade-guide.md",
	"docs/threat-model.md",
];

function parseSemverFromStatus(line: string): string | null {
	const m = line.match(/\*\*Status:\*\*[^0-9]*(\d+\.\d+\.\d+)/);
	return m?.[1] ?? null;
}

function semverLt(a: string, b: string): boolean {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
		if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
	}
	return false;
}

describe("LSG-DOC: documentation readiness", () => {
	const version = pkgVersion();

	it("DOC01: getting-started has createByteGuard and guardEvents examples", () => {
		const doc = read("docs/getting-started.md");
		expect(doc).toContain("createByteGuard");
		expect(doc).toContain("guardEvents");
	});

	it("DOC02: concepts-and-glossary references modes.svg", () => {
		expect(read("docs/concepts-and-glossary.md")).toContain("modes.svg");
	});

	it("DOC03: policy-reference mentions every RULE_KEYS entry", () => {
		const doc = read("docs/policy-reference.md");
		for (const key of RULE_KEYS) {
			expect(doc).toContain(key);
		}
	});

	it("DOC04: cli-reference separates CLI router and audit exit codes", () => {
		const doc = read("docs/cli-reference.md");
		expect(doc).toMatch(/Exit codes \(CLI\)/);
		expect(doc).toMatch(/Exit codes \(audit\)/);
		expect(doc).toMatch(/\|\s*2\s*\|\s*Usage error/);
		expect(doc).toMatch(/\|\s*3\s*\|\s*Internal error/);
	});

	it("DOC05: docs-map links getting-started, cookbook, policy-reference", () => {
		const doc = read("docs/docs-map.md");
		expect(doc).toContain("getting-started.md");
		expect(doc).toContain("integration-cookbook.md");
		expect(doc).toContain("policy-reference.md");
	});

	it("DOC06: README New to LLM streams links getting-started", () => {
		const readme = read("README.md");
		expect(readme).toMatch(/New to LLM streams\?/i);
		expect(readme).toContain("docs/getting-started.md");
	});

	it("DOC07: FAQ top-level status matches package.json version", () => {
		const faq = read("docs/faq.md");
		const statusLine = faq.split("\n").find((l) => l.startsWith("**Status:**"));
		expect(statusLine).toContain(version);
	});

	it("DOC08: five beginner/audit diagram SVGs exist", () => {
		for (const base of [
			"stream-anatomy",
			"getting-started-journey",
			"tool-call-lifecycle",
			"policy-rules-map",
			"static-audit-flow",
		]) {
			expect(existsSync(join(rootDir, "docs/img", `${base}.svg`))).toBe(true);
		}
	});

	it("DOC09: docs/img/README lists five beginner/audit diagrams", () => {
		const doc = read("docs/img/README.md");
		for (const base of [
			"stream-anatomy",
			"getting-started-journey",
			"tool-call-lifecycle",
			"policy-rules-map",
			"static-audit-flow",
		]) {
			expect(doc).toContain(base);
		}
	});

	it("DOC10: cookbook prerequisites link getting-started", () => {
		const section = read("docs/integration-cookbook.md").split("## 1. Prerequisites")[1] ?? "";
		expect(section).toContain("getting-started.md");
	});

	it("DOC11: static-scanning links cli-reference or static-audit-flow", () => {
		const doc = read("docs/static-scanning.md");
		expect(doc.includes("cli-reference.md") || doc.includes("static-audit-flow")).toBe(true);
	});

	it("DOC12: ci-github-action links action README and pins @v version", () => {
		const doc = read("docs/ci-github-action.md");
		expect(doc).toContain("action/README.md");
		expect(doc).toContain(`@v${version}`);
	});

	it("DOC13: build-diagrams.mjs renders 21 diagrams", () => {
		const script = read("scripts/build-diagrams.mjs");
		const count = (script.match(/^\t"[^"]+\.mmd"/gm) ?? []).length;
		expect(count).toBe(21);
	});

	it("DOC14: getting-started has common mistakes section", () => {
		expect(read("docs/getting-started.md")).toMatch(/Common mistakes/i);
	});

	it("DOC15: policy-reference E001–E010 and E011 export note", () => {
		const doc = read("docs/policy-reference.md");
		for (let i = 1; i <= 10; i++) {
			expect(doc).toContain(`POLICY_E${String(i).padStart(3, "0")}`);
		}
		expect(doc).toContain("POLICY_E011");
		expect(doc).toMatch(/E011|export-only|not emitted/i);
	});

	it("DOC16: cli-reference documents GUARD_MODE and GUARD_POLICY_PATH", () => {
		const doc = read("docs/cli-reference.md");
		expect(doc).toContain("GUARD_MODE");
		expect(doc).toContain("GUARD_POLICY_PATH");
	});

	it("DOC17: docs-map persona table has at least four rows", () => {
		const table = read("docs/docs-map.md").split("## Who are you?")[1]?.split("\n---\n")[0] ?? "";
		const rows = table.match(/^\| \*\*/gm) ?? [];
		expect(rows.length).toBeGreaterThanOrEqual(4);
	});

	it("DOC18: core docs relative links resolve on disk", () => {
		for (const file of [
			"docs/getting-started.md",
			"docs/concepts-and-glossary.md",
			"docs/policy-reference.md",
			"docs/cli-reference.md",
		]) {
			const text = read(file);
			const links = [...text.matchAll(/\]\(\.\/([^)#]+)\)/g)].map((m) => m[1]);
			for (const link of links) {
				const target = join(rootDir, "docs", link);
				const resolved = existsSync(target)
					? target
					: existsSync(`${target}.md`)
						? `${target}.md`
						: null;
				expect(resolved, `${file} → ${link}`).toBeTruthy();
			}
		}
	});

	it("DOC19: README Documentation links policy-reference and cli-reference", () => {
		const section = read("README.md").split("## Documentation")[1] ?? "";
		expect(section).toContain("policy-reference.md");
		expect(section).toContain("cli-reference.md");
	});

	it("DOC20: CHANGELOG has version section for package.json", () => {
		expect(read("CHANGELOG.md")).toContain(`## [${version}]`);
	});

	it("DOC21: cookbook §2–§11 link examples or inline-only", () => {
		const cookbook = read("docs/integration-cookbook.md");
		for (let n = 2; n <= 11; n++) {
			const start = cookbook.indexOf(`## ${n}.`);
			const end = cookbook.indexOf(`## ${n + 1}.`, start + 1);
			const section = end === -1 ? cookbook.slice(start) : cookbook.slice(start, end);
			expect(
				section.includes("examples/") || section.includes("inline-only"),
				`cookbook §${n}`,
			).toBe(true);
		}
	});

	it("DOC22: no stale Status semver below package version", () => {
		for (const file of STATUS_SCAN_FILES) {
			const line = read(file)
				.split("\n")
				.find((l) => l.startsWith("**Status:**"));
			if (!line) continue;
			const found = parseSemverFromStatus(line);
			if (found) {
				expect(semverLt(found, version), `${file}: ${line}`).toBe(false);
			}
		}
	});

	it("DOC23: docs-map links examples README; getting-started mentions examples:smoke", () => {
		expect(read("docs/docs-map.md")).toContain("examples/README.md");
		expect(read("docs/getting-started.md")).toMatch(/examples:smoke|examples\/minimal-node/);
	});

	it("DOC24: examples README has Persona column", () => {
		const table = read("examples/README.md");
		expect(table).toMatch(/Persona/i);
		expect(table).toMatch(/proxy|agent|ci|smoke/i);
	});

	it("DOC25: schemas README mentions both schema files", () => {
		const doc = read("schemas/README.md");
		expect(doc).toContain("policy-v1.json");
		expect(doc).toContain("tools-manifest-v1.json");
	});

	it("DOC26: troubleshooting has at least eight symptom table rows", () => {
		const doc = read("docs/troubleshooting.md");
		const table = doc.split("## Quick symptom index")[1]?.split("\n---\n")[0] ?? "";
		const rows = table.match(/^\| [^|]/gm) ?? [];
		expect(rows.length).toBeGreaterThanOrEqual(8);
	});

	it("DOC27: CONTRIBUTING has Documentation section with diagrams:build", () => {
		const doc = read("CONTRIBUTING.md");
		expect(doc).toContain("## Documentation");
		expect(doc).toContain("diagrams:build");
	});

	it("DOC28: security-reporting mentions redaction bypass", () => {
		const doc = read("docs/security-reporting.md");
		expect(doc).toMatch(/redaction bypass|secret redaction bypass/i);
		expect(doc).toMatch(/GitHub issues/i);
	});

	it("DOC29: SECURITY.md links security-reporting", () => {
		const doc = read("SECURITY.md");
		expect(doc).toContain("security-reporting.md");
	});

	it("DOC30: doc:check-links script wired in package.json verify", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["doc:check-links"]).toContain("check-doc-links.mjs");
		expect(pkg.scripts.verify).toContain("doc:check-links");
		expect(existsSync(join(rootDir, "scripts/check-doc-links.mjs"))).toBe(true);
	});

	it("DOC31: upgrade-guide mentions 0.7.0 and Action @v pin", () => {
		const doc = read("docs/upgrade-guide.md");
		expect(doc).toContain("0.7.0");
		expect(doc).toContain(`@v${version}`);
	});

	it("DOC32: docs-map learning path lists troubleshooting and security-reporting", () => {
		const path = read("docs/docs-map.md").split("Learning path")[1] ?? "";
		expect(path).toContain("troubleshooting.md");
		expect(path).toContain("security-reporting.md");
	});

	it("DOC33: each persona has example path on disk", () => {
		const readme = read("examples/README.md");
		const map: Record<string, string[]> = {
			proxy: ["byte-proxy/hono.ts", "byte-proxy/workers.ts"],
			agent: ["event-gate/agent-loop.ts"],
			ci: ["policy-ci/scan-fixtures.sh"],
			smoke: ["minimal-node/smoke.mjs"],
		};
		for (const [persona, paths] of Object.entries(map)) {
			expect(readme.toLowerCase()).toContain(persona);
			expect(paths.some((p) => existsSync(join(rootDir, "examples", p)))).toBe(true);
		}
	});

	it("DOC34: action README has INPUT to CLI mapping", () => {
		const doc = read("action/README.md");
		expect(doc).toMatch(/How inputs map to CLI|INPUT.*CLI/i);
		expect(doc).toContain("scan");
		expect(doc).toContain("audit static");
	});

	it("DOC35: threat-model has Out of scope and security-reporting link", () => {
		const doc = read("docs/threat-model.md");
		expect(doc).toMatch(/Out of scope/i);
		expect(doc).toContain("security-reporting.md");
	});
});

describe("LSG-DOC edge cases", () => {
	it("DOC-E01: troubleshooting links resolve to existing docs", () => {
		expect(read("docs/troubleshooting.md")).toContain("cli-reference.md");
		expect(existsSync(join(rootDir, "docs/cli-reference.md"))).toBe(true);
	});

	it("DOC-E02: policy-reference links schemas README", () => {
		expect(read("docs/policy-reference.md")).toContain("schemas/README.md");
	});

	it("DOC-E03: npm pack includes schemas README when built", () => {
		if (!existsSync(join(rootDir, "dist/index.js"))) return;
		const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
			cwd: rootDir,
			encoding: "utf8",
		});
		const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
		const paths = pack.files.map((f) => f.path);
		expect(paths).toContain("schemas/README.md");
		expect(paths).toContain("schemas/policy-v1.json");
	}, 30_000);

	it("DOC-E04: no stale action pins below current version in consumer docs", () => {
		const version = pkgVersion();
		const files = [
			"action/README.md",
			"docs/ci-github-action.md",
			"docs/faq.md",
			"docs/upgrade-guide.md",
		];
		const stale = /llm-stream-guard\/action@v0\.([0-7]|8\.0|8\.1)\b/;
		for (const file of files) {
			const text = read(file);
			expect(text, file).toContain(`@v${version}`);
			if (file !== "docs/upgrade-guide.md") {
				expect(stale.test(text), `${file} has stale action pin`).toBe(false);
			}
		}
	});

	it("DOC-E05: SECURITY.md and security-reporting cross-link", () => {
		expect(read("SECURITY.md")).toContain("security-reporting");
		expect(read("docs/security-reporting.md")).toContain("SECURITY.md");
	});

	it("DOC-E06: upgrade-guide and threat-model linked from docs-map", () => {
		const map = read("docs/docs-map.md");
		expect(map).toContain("upgrade-guide.md");
		expect(map).toContain("threat-model.md");
	});

	it("DOC-E07: check-doc-links exits zero on default scan set", () => {
		execFileSync("node", ["scripts/check-doc-links.mjs", "--check"], {
			cwd: rootDir,
			stdio: "pipe",
		});
	}, 30_000);

	it("DOC-E08: all 21 diagram SVGs exist", () => {
		const script = read("scripts/build-diagrams.mjs");
		const names = [...script.matchAll(/"([^"]+\.mmd)"/g)].map((m) => m[1].replace(".mmd", ".svg"));
		for (const svg of names) {
			expect(existsSync(join(rootDir, "docs/img", svg)), svg).toBe(true);
		}
	});
});
