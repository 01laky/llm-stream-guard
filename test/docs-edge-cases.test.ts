/**
 * LSG-DOC-E09–E55 — extended documentation edge cases (Phase 8.2).
 * Complements LSG-DOC01–35 and DOC-E01–08 in docs-readiness.test.ts.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
	return readFileSync(join(rootDir, path), "utf8");
}

function pkgVersion(): string {
	return (JSON.parse(read("package.json")) as { version: string }).version;
}

function troubleshootingSections(): string[] {
	return read("docs/troubleshooting.md")
		.split("\n")
		.filter((line) => line.startsWith("## "))
		.map((line) => line.slice(3).trim());
}

function extractInternalAnchors(markdown: string): string[] {
	return [...markdown.matchAll(/\]\([^)]*#([a-z0-9-]+)\)/gi)].map((m) => m[1].toLowerCase());
}

function slugifyHeading(title: string): string {
	return title
		.toLowerCase()
		.replace(/`/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

describe("LSG-DOC-E09–E20: troubleshooting & security docs", () => {
	it("DOC-E09: troubleshooting index anchors resolve to section headings", () => {
		const doc = read("docs/troubleshooting.md");
		const index = doc.split("## Quick symptom index")[1]?.split("\n---\n")[0] ?? "";
		const anchors = extractInternalAnchors(index);
		expect(anchors.length).toBeGreaterThanOrEqual(8);
		const headings = troubleshootingSections().map(slugifyHeading);
		for (const anchor of anchors) {
			expect(headings, `missing section for #${anchor}`).toContain(anchor);
		}
	});

	it("DOC-E10: troubleshooting detail sections have Likely cause and Fix", () => {
		const doc = read("docs/troubleshooting.md");
		const skip = new Set(["Quick symptom index", "Debug checklist", "Where to get help"]);
		for (const title of troubleshootingSections()) {
			if (skip.has(title)) continue;
			const chunk = doc.split(`## ${title}`)[1]?.split("\n## ")[0] ?? "";
			expect(chunk, title).toMatch(/\*\*Likely cause:\*\*/);
			expect(chunk, title).toMatch(/\*\*Fix:\*\*/);
		}
	});

	it("DOC-E11: troubleshooting debug checklist lists four CLI steps", () => {
		const section = read("docs/troubleshooting.md").split("## Debug checklist")[1] ?? "";
		const items = section.match(/^\d+\.\s/gm) ?? [];
		expect(items.length).toBeGreaterThanOrEqual(4);
		expect(section).toMatch(/GUARD_MODE|resolve/);
		expect(section).toMatch(/validate/);
		expect(section).toMatch(/scan/);
		expect(section).toMatch(/audit static/);
	});

	it("DOC-E12: troubleshooting where-to-get-help links upgrade and security", () => {
		const section = read("docs/troubleshooting.md").split("## Where to get help")[1] ?? "";
		expect(section).toContain("upgrade-guide.md");
		expect(section).toContain("security-reporting.md");
		expect(section).toContain("faq.md");
	});

	it("DOC-E13: troubleshooting includes at least one fenced code example", () => {
		expect(read("docs/troubleshooting.md")).toMatch(/```(?:ts|bash)/);
	});

	it("DOC-E14: troubleshooting tool section mentions blockToolArgs and tool_call.done", () => {
		const section =
			read("docs/troubleshooting.md").split("## Tool executed despite deny policy")[1] ?? "";
		expect(section.toLowerCase()).toMatch(/blocktoolargs/);
		expect(section).toMatch(/tool_call\.done/);
	});

	it("DOC-E15: cookbook §13 is summary-only (no legacy 6-row mistake table)", () => {
		const section = read("docs/integration-cookbook.md").split("## 13. Troubleshooting")[1] ?? "";
		expect(section).toContain("troubleshooting.md");
		expect(section).not.toMatch(/\| Mistake\s+\| Fix\s+\|/);
	});

	it("DOC-E16: SECURITY.md lists 0.8.x as supported", () => {
		const doc = read("SECURITY.md");
		expect(doc).toMatch(/0\.8\.x/);
		expect(doc).toMatch(/Supported/i);
	});

	it("DOC-E17: security-reporting has report / do-not-report / how sections", () => {
		const doc = read("docs/security-reporting.md");
		expect(doc).toMatch(/What to report/i);
		expect(doc).toMatch(/What not to report/i);
		expect(doc).toMatch(/How to report/i);
	});

	it("DOC-E18: security-reporting mentions sanitized fixture placeholders", () => {
		expect(read("docs/security-reporting.md")).toMatch(/sk-test/);
		expect(read("docs/security-reporting.md")).toMatch(/test\/fixtures/);
	});

	it("DOC-E19: security-reporting links threat-model stub", () => {
		expect(read("docs/security-reporting.md")).toContain("threat-model-stub.md");
	});

	it("DOC-E20: FAQ beginners block links docs-map", () => {
		const beginners = read("docs/faq.md").split("## Beginners")[1]?.split("## General")[0] ?? "";
		expect(beginners).toContain("docs-map.md");
	});
});

describe("LSG-DOC-E21–E32: upgrade, threat model, schemas, action parity", () => {
	const version = pkgVersion();

	it("DOC-E21: upgrade-guide covers 0.7, 0.8.x, npm, Action, and doc locations", () => {
		const doc = read("docs/upgrade-guide.md");
		expect(doc).toMatch(/0\.7\.0/);
		expect(doc).toMatch(/0\.8\.[01]/);
		expect(doc).toMatch(/npm install/);
		expect(doc).toContain(`@v${version}`);
		expect(doc).toMatch(/GitHub `docs\/`/i);
	});

	it("DOC-E22: threat-model-stub has scope, boundaries, in/out scope, assumptions", () => {
		const doc = read("docs/threat-model-stub.md");
		expect(doc).toMatch(/Scope/i);
		expect(doc).toMatch(/Trust boundaries/i);
		expect(doc).toMatch(/In-scope threats/i);
		expect(doc).toMatch(/Out of scope/i);
		expect(doc).toMatch(/Assumptions/i);
	});

	it("DOC-E23: threat-model links proposal non-goals", () => {
		expect(read("docs/threat-model-stub.md")).toMatch(/proposal\.MD#non-goals/i);
	});

	it("DOC-E24: README documents all Phase 8.2 guide links", () => {
		const section = read("README.md").split("## Documentation")[1] ?? "";
		for (const link of [
			"troubleshooting.md",
			"upgrade-guide.md",
			"security-reporting.md",
			"threat-model-stub.md",
			"schemas/README.md",
			"SECURITY.md",
		]) {
			expect(section, link).toContain(link);
		}
	});

	it("DOC-E25: schemas README documents runtime validators and no ajv", () => {
		const doc = read("schemas/README.md");
		expect(doc).toMatch(/validatePolicy/);
		expect(doc).toMatch(/validateManifestDocument/);
		expect(doc).toMatch(/ajv/i);
		expect(doc).toMatch(/authoritative/i);
	});

	it("DOC-E26: npm pack includes schemas but not docs tree", () => {
		if (!existsSync(join(rootDir, "dist/index.js"))) return;
		const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
			cwd: rootDir,
			encoding: "utf8",
		});
		const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
		const paths = pack.files.map((f) => f.path);
		expect(paths.some((p) => p.startsWith("schemas/"))).toBe(true);
		expect(paths.some((p) => p.startsWith("docs/"))).toBe(false);
	}, 30_000);

	it("DOC-E27: action run.mjs setOutput keys match action.yml outputs", () => {
		const yml = read("action/action.yml");
		const run = read("action/run.mjs");
		const outputsBlock = yml.split("outputs:")[1]?.split("runs:")[0] ?? "";
		const yamlOutputs = [...outputsBlock.matchAll(/^\s{2}([a-z0-9-]+):/gm)].map((m) => m[1]);
		for (const key of yamlOutputs) {
			expect(run, key).toMatch(new RegExp(`setOutput\\("${key}"`));
		}
		expect(yamlOutputs.sort()).toEqual(
			["drift-count", "policy-changed", "sarif-path", "static-findings", "violations"].sort(),
		);
	});

	it("DOC-E28: action README maps all twelve YAML inputs", () => {
		const readme = read("action/README.md");
		for (const key of [
			"policy",
			"policy-dir",
			"baseline-policy",
			"scan-paths",
			"static-root",
			"manifest",
			"include",
			"exclude",
			"fail-on",
			"annotate",
			"sarif-out",
			"mode",
		]) {
			expect(readme).toContain(`\`${key}\``);
		}
	});

	it("DOC-E29: ci-github-action documents every fail-on enum value", () => {
		const doc = read("docs/ci-github-action.md");
		for (const value of ["violations", "drift", "static", "any", "none"]) {
			expect(doc).toContain(value);
		}
	});

	it("DOC-E30: action README mentions @main for bleeding edge", () => {
		expect(read("action/README.md")).toMatch(/@main/);
	});

	it("DOC-E31: guard-audit workflow dogfoods CLI not composite action pin", () => {
		const workflow = read(".github/workflows/guard-audit.yml");
		expect(workflow).toContain("node dist/cli.js");
		expect(workflow).not.toMatch(/uses:\s*01laky\/llm-stream-guard\/action@v/);
		expect(workflow).toMatch(/ci-github-action/);
	});

	it("DOC-E32: FAQ documents What works in current version", () => {
		const faq = read("docs/faq.md");
		expect(faq).toContain(`What works in ${version}?`);
		expect(faq).toContain("upgrade-guide.md");
	});
});

describe("LSG-DOC-E33–E42: link checker, version sync, examples registry", () => {
	it("DOC-E33: check-doc-links rejects broken relative link", () => {
		const fixtureDir = join(rootDir, "test/fixtures/docs-link-check");
		mkdirSync(fixtureDir, { recursive: true });
		try {
			writeFileSync(join(fixtureDir, "broken.md"), "[bad](../totally-missing-doc.md)\n");
			const r = spawnSync(
				"node",
				[
					"scripts/check-doc-links.mjs",
					"--check",
					"--files",
					"test/fixtures/docs-link-check/broken.md",
				],
				{ cwd: rootDir, encoding: "utf8" },
			);
			expect(r.status).not.toBe(0);
			expect(`${r.stderr}${r.stdout}`).toMatch(/broken:/);
		} finally {
			rmSync(fixtureDir, { recursive: true, force: true });
		}
	});

	it("DOC-E34: check-doc-links ignores mailto and https links", () => {
		const fixtureDir = join(rootDir, "test/fixtures/docs-link-check");
		mkdirSync(fixtureDir, { recursive: true });
		try {
			writeFileSync(
				join(fixtureDir, "external.md"),
				"[e](https://example.com) [m](mailto:a@b.com) [ok](./broken-only-if-relative.md)\n",
			);
			const r = spawnSync(
				"node",
				[
					"scripts/check-doc-links.mjs",
					"--check",
					"--files",
					"test/fixtures/docs-link-check/external.md",
				],
				{ cwd: rootDir, encoding: "utf8" },
			);
			// Should fail only on relative broken link, not https/mailto
			expect(`${r.stderr}${r.stdout}`).not.toMatch(/https:/);
			expect(`${r.stderr}${r.stdout}`).not.toMatch(/mailto:/);
		} finally {
			rmSync(fixtureDir, { recursive: true, force: true });
		}
	});

	it("DOC-E35: default link scan set includes SECURITY and schemas README", () => {
		const script = read("scripts/check-doc-links.mjs");
		expect(script).toContain("SECURITY.md");
		expect(script).toContain("schemas/README.md");
	});

	it("DOC-E36: package.json version matches src/version.ts export", () => {
		const pkg = pkgVersion();
		expect(read("src/version.ts")).toContain(`"${pkg}"`);
	});

	it("DOC-E37: README badges align with package version", () => {
		const pkg = pkgVersion();
		const readme = read("README.md");
		expect(readme).toContain(`core-${pkg}-brightgreen`);
		expect(readme).toContain(`status-stable_${pkg}-brightgreen`);
		expect(readme).toContain(`Stable \`${pkg}\``);
	});

	it("DOC-E38: CHANGELOG current version mentions doc gates and check-doc-links", () => {
		const version = pkgVersion();
		const section = read("CHANGELOG.md").split(`## [${version}]`)[1]?.split("\n## [")[0] ?? "";
		expect(section).toMatch(/troubleshooting|LSG-DOC/i);
		expect(section).toMatch(/check-doc-links|doc:check-links/i);
	});

	it("DOC-E39: examples README table paths exist and personas are valid", () => {
		const readme = read("examples/README.md");
		const allowed = new Set(["proxy", "agent", "ci", "smoke"]);
		const rows = [...readme.matchAll(/^\| `([^`]+)`\s+\|\s+(\w+)\s+\|/gm)];
		expect(rows.length).toBeGreaterThanOrEqual(8);
		for (const [, path, persona] of rows) {
			expect(allowed.has(persona.toLowerCase()), persona).toBe(true);
			const full = join(rootDir, "examples", path);
			expect(existsSync(full), path).toBe(true);
		}
	});

	it("DOC-E40: docs-map learning path orders troubleshooting before security-reporting", () => {
		const path = read("docs/docs-map.md").split("Learning path")[1] ?? "";
		const t = path.indexOf("troubleshooting.md");
		const s = path.indexOf("security-reporting.md");
		expect(t).toBeGreaterThan(-1);
		expect(s).toBeGreaterThan(t);
	});

	it("DOC-E41: cli-reference router section excludes exit code 3", () => {
		const cliSection =
			read("docs/cli-reference.md").split("Exit codes (CLI)")[1]?.split("Exit codes (audit)")[0] ??
			"";
		expect(cliSection).not.toMatch(/\|\s*3\s*\|/);
	});

	it("DOC-E42: cli-reference audit section includes exit codes 0 through 3", () => {
		const auditSection = read("docs/cli-reference.md").split("Exit codes (audit)")[1] ?? "";
		for (const code of ["0", "1", "2", "3"]) {
			expect(auditSection).toMatch(new RegExp(`\\|\\s*${code}\\s*\\|`));
		}
	});
});

describe("LSG-DOC-E43–E55: diagrams, contributing, publishing, release prep", () => {
	it("DOC-E43: every committed docs/img mmd has matching svg", () => {
		const imgDir = join(rootDir, "docs/img");
		const mmds = readdirSync(imgDir).filter((f) => f.endsWith(".mmd"));
		expect(mmds.length).toBe(18);
		for (const mmd of mmds) {
			expect(existsSync(join(imgDir, mmd.replace(".mmd", ".svg"))), mmd).toBe(true);
		}
	});

	it("DOC-E44: README raw SVG URLs use main/docs/img path", () => {
		const readme = read("README.md");
		const urls = readme.match(/raw\.githubusercontent\.com[^)\s]+/g) ?? [];
		expect(urls.length).toBeGreaterThan(5);
		for (const url of urls) {
			expect(url).toContain("/main/docs/img/");
		}
	});

	it("DOC-E45: CONTRIBUTING documents LSG-DOC prefix", () => {
		expect(read("CONTRIBUTING.md")).toMatch(/\*\*LSG-DOC\*\*/);
	});

	it("DOC-E46: testing-strategy documents DOC-E extended range", () => {
		const doc = read("docs/testing-strategy.md");
		expect(doc).toMatch(/REL31|REL43/);
		expect(doc).toMatch(/docs-readiness|DOC01/);
		expect(doc).toMatch(/docs-edge-cases|DOC-E09/);
	});

	it("DOC-E47: publishing.md documents bin path without ./ prefix", () => {
		expect(read("docs/publishing.md")).toMatch(
			/without `\.\/`|without `\.\/` prefix|dist\/cli\.js/,
		);
	});

	it("DOC-E48: release-prep script checks schemas README and SECURITY", () => {
		const script = read("scripts/release-prep.mjs");
		expect(script).toContain("schemas/README.md");
		expect(script).toContain("SECURITY.md");
		expect(script).toContain("doc:check-links");
	});

	it("DOC-E49: all new Phase 8.2 docs have Status 0.8.2 line", () => {
		const version = pkgVersion();
		for (const file of [
			"docs/troubleshooting.md",
			"docs/security-reporting.md",
			"docs/upgrade-guide.md",
			"docs/threat-model-stub.md",
		]) {
			const line = read(file)
				.split("\n")
				.find((l) => l.startsWith("**Status:**"));
			expect(line, file).toContain(version);
		}
	});

	it("DOC-E50: upgrade-guide npm install string includes current version", () => {
		expect(read("docs/upgrade-guide.md")).toContain(`llm-stream-guard@${pkgVersion()}`);
	});

	it("DOC-E51: security-reporting template includes Version field", () => {
		expect(read("docs/security-reporting.md")).toMatch(/\*\*Version:\*\*/);
	});

	it("DOC-E52: docs-map By topic lists troubleshooting and schemas rows", () => {
		const topic = read("docs/docs-map.md").split("### Policy & CLI")[1] ?? "";
		expect(topic).toContain("troubleshooting.md");
		expect(topic).toContain("schemas/README.md");
	});

	it("DOC-E53: faq retains historical What works sections", () => {
		const faq = read("docs/faq.md");
		for (const ver of ["0.7.0", "0.6.0", "0.5.0"]) {
			expect(faq).toContain(`What works in ${ver}?`);
		}
	});

	it("DOC-E54: ci-github-action matrix example pins current action version twice", () => {
		const doc = read("docs/ci-github-action.md");
		const version = pkgVersion();
		const matches = doc.match(new RegExp(`@v${version.replace(/\./g, "\\.")}`, "g")) ?? [];
		expect(matches.length).toBeGreaterThanOrEqual(4);
	});

	it("DOC-E55: docs-readiness and docs-edge-cases files cover DOC id ranges", () => {
		const core = read("test/docs-readiness.test.ts");
		const ext = read("test/docs-edge-cases.test.ts");
		expect(core).toMatch(/DOC35/);
		expect(core).toMatch(/DOC-E08/);
		expect(ext).toMatch(/DOC-E09/);
		expect(ext).toMatch(/DOC-E55/);
	});
});
