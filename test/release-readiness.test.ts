import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

function read(path: string): string {
	return readFileSync(join(rootDir, path), "utf8");
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.d.ts"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-REL: release readiness", () => {
	it("LSG-REL01: README has Install section with npm install hint", () => {
		const readme = read("README.md");
		expect(readme).toContain("## Install");
		expect(readme).toMatch(/pnpm add llm-stream-guard|npm install llm-stream-guard/);
	});

	it("LSG-REL02: README has Quickstart section", () => {
		expect(read("README.md")).toContain("## Quickstart");
	});

	it("LSG-REL03: README has Non-goals section", () => {
		expect(read("README.md")).toContain("## Non-goals");
	});

	it("LSG-REL04: README stable status matches package.json version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(read("README.md")).toContain(`Stable \`${pkg.version}\``);
	});

	it("LSG-REL05: README core and status badges match package.json version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		const readme = read("README.md");
		expect(readme).toContain(`core-${pkg.version}-brightgreen`);
		expect(readme).toContain(`status-stable_${pkg.version}-brightgreen`);
	});

	it("LSG-REL06: npm pack dry-run includes dist README and LICENSE", () => {
		const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
			cwd: rootDir,
			encoding: "utf8",
		});
		const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
		const files = pack.files.map((file) => file.path);
		expect(files).toContain("dist/index.js");
		expect(files).toContain("dist/index.cjs");
		expect(files).toContain("README.md");
		expect(files).toContain("LICENSE");
	}, 30_000);

	it("LSG-REL07: package smoke script exists", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["smoke:package"]).toBe("node scripts/smoke-package.mjs");
	});

	it("LSG-REL08: package runtime dependencies remain empty", () => {
		const pkg = JSON.parse(read("package.json")) as {
			dependencies?: Record<string, string>;
			optionalDependencies?: Record<string, string>;
			peerDependencies?: Record<string, string>;
		};
		expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
		expect(Object.keys(pkg.optionalDependencies ?? {})).toEqual([]);
		expect(Object.keys(pkg.peerDependencies ?? {})).toEqual([]);
	});

	it("LSG-REL09: release prep script is wired in package.json", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["release:prep"]).toBe("node scripts/release-prep.mjs");
		expect(existsSync(join(rootDir, "scripts/release-prep.mjs"))).toBe(true);
	});

	it("LSG-REL10: release-prep validates README tests badge against vitest count", () => {
		const script = read("scripts/release-prep.mjs");
		expect(script).toMatch(/tests-\(\d+\)_passing|tests badge/i);
		expect(script).toContain("LSG-REL04");
	});

	it("LSG-REL11: release-prep validates stable green badges", () => {
		const script = read("scripts/release-prep.mjs");
		expect(script).toContain("status-stable_");
		expect(script).toContain("core-${version}-brightgreen");
		expect(script).toContain("_scaffold-orange");
	});

	it("LSG-REL12: CHANGELOG has version header matching package.json", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(read("CHANGELOG.md")).toContain(`## [${pkg.version}]`);
	});

	it("LSG-REL13: package is not private (npm publish ready)", () => {
		const pkg = JSON.parse(read("package.json")) as { private?: boolean };
		expect(pkg.private).not.toBe(true);
	});

	it("LSG-REL14: publishing checklist doc exists", () => {
		expect(read("docs/publishing.md")).toContain("pnpm release:prep");
		expect(read("docs/publishing.md")).toContain("git tag vX.Y.Z");
	});

	it("LSG-REL15: README documents CLI policy workflow", () => {
		const readme = read("README.md");
		expect(readme).toContain("llm-stream-guard");
		expect(readme).toContain("loadPolicy");
		expect(readme).toContain("createGuardFromPolicy");
	});

	it("LSG-REL16: smoke-package validates CLI from tarball", () => {
		expect(read("scripts/smoke-package.mjs")).toContain("cli.js");
		expect(read("scripts/smoke-package.mjs")).toContain("validate");
	});

	it("LSG-REL17: README status and badges reference package version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		const readme = read("README.md");
		expect(readme).toContain(`Stable \`${pkg.version}\``);
		expect(readme).toContain(`core-${pkg.version}-brightgreen`);
		expect(readme).toContain(`status-stable_${pkg.version}-brightgreen`);
	});

	it("LSG-REL18: CHANGELOG documents 0.4.0 cookbook and examples", () => {
		const changelog = read("CHANGELOG.md");
		expect(changelog).toContain("## [0.4.0]");
		expect(changelog).toMatch(/integration cookbook|examples\//i);
		expect(changelog).toMatch(/LSG-CBK/i);
	});

	it("LSG-REL19: README Documentation links examples README and cookbook", () => {
		const readme = read("README.md");
		const docSection = readme.split("## Documentation")[1]?.split("## How this compares")[0] ?? "";
		expect(docSection).toContain("integration-cookbook.md");
		expect(docSection).toContain("examples/README.md");
	});

	it("LSG-REL20: README status and badges reference current package version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(read("README.md")).toContain(`Stable \`${pkg.version}\``);
	});

	it("LSG-REL21: CHANGELOG documents 0.5.0 Action and static audit", () => {
		const changelog = read("CHANGELOG.md");
		expect(changelog).toContain("## [0.5.0]");
		expect(changelog).toMatch(/GitHub Action|static audit|LSG-STA/i);
	});

	it("LSG-REL22: README links ci-github-action and action README", () => {
		const readme = read("README.md");
		expect(readme).toContain("docs/ci-github-action.md");
		expect(readme).toContain("action/README.md");
	});

	it("LSG-REL23: CHANGELOG documents 0.6.0 source refactor and audit export", () => {
		const changelog = read("CHANGELOG.md");
		expect(changelog).toContain("## [0.6.0]");
		expect(changelog).toMatch(/shared\/walk|src\/scan/i);
		expect(changelog).toMatch(/\.\/audit/);
		const pkg = JSON.parse(read("package.json")) as { exports?: Record<string, unknown> };
		expect(pkg.exports?.["./audit"]).toBeDefined();
	});

	it("LSG-REL24: refactor edge case suite covers LSG-REF prefix", () => {
		const source = read("test/refactor-edge-cases.test.ts");
		expect(source).toMatch(/LSG-REF01/);
		expect(source).toMatch(/LSG-REF25/);
	});

	it("LSG-REL25: CHANGELOG documents 0.7.0 coverage release", () => {
		const changelog = read("CHANGELOG.md");
		expect(changelog).toContain("## [0.7.0]");
		expect(changelog).toMatch(/LSG-COV|coverage/i);
		expect(changelog).toMatch(/stretch|fuzz|schema/i);
	});

	it("LSG-REL26: README test badge matches package version", () => {
		const readme = read("README.md");
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(readme).toContain(pkg.version);
		expect(readme).toMatch(/tests-\d+_passing/);
	});

	it("LSG-REL30: bin path is npm-publish safe (no ./ prefix)", () => {
		const pkg = JSON.parse(read("package.json")) as { bin?: Record<string, string> };
		const cliBin = pkg.bin?.["llm-stream-guard"];
		expect(cliBin).toBe("dist/cli.js");
		expect(cliBin?.startsWith("./")).toBe(false);
	});

	it("LSG-REL27: all coverage test files exist", () => {
		const files = [
			"test/coverage-matrix.test.ts",
			"test/coverage-audit-exhaustive.test.ts",
			"test/coverage-cli-exhaustive.test.ts",
			"test/coverage-policy-exhaustive.test.ts",
			"test/coverage-scan-exhaustive.test.ts",
			"test/coverage-shared-exhaustive.test.ts",
			"test/coverage-refactor-parity.test.ts",
			"test/coverage-schemas.test.ts",
			"test/coverage-fuzz.test.ts",
			"test/coverage-stretch.test.ts",
		];
		for (const f of files) {
			expect(read(f).length).toBeGreaterThan(100);
		}
	});

	it("LSG-REL28: testing-strategy documents Phase 7 LSG-COV", () => {
		const doc = read("docs/testing-strategy.md");
		expect(doc).toMatch(/Phase 7|LSG-COV|0\.7\.0/i);
		expect(doc).toMatch(/coverage-matrix|coverage-stretch/);
	});

	it("LSG-REL29: guard-audit workflow dogfood commands gate", () => {
		const workflow = read(".github/workflows/guard-audit.yml");
		expect(workflow).toContain("audit static");
		expect(workflow).toContain("validate-manifest");
		expect(workflow).toContain("pnpm build");
		const stretch = read("test/coverage-stretch.test.ts");
		expect(stretch).toMatch(/LSG-COV219/);
		expect(stretch).toMatch(/LSG-COV220/);
	});

	it("LSG-REL31: CHANGELOG documents 0.8.2 Phase 8 completion", () => {
		const changelog = read("CHANGELOG.md");
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(changelog).toContain(`## [${pkg.version}]`);
		expect(changelog).toMatch(/troubleshooting|LSG-DOC|schemas README/i);
	});

	it("LSG-REL32: docs-readiness test file exists with DOC01", () => {
		const source = read("test/docs-readiness.test.ts");
		expect(source).toMatch(/DOC01/);
	});

	it("LSG-REL33: README and docs-map reference getting-started", () => {
		expect(read("README.md")).toContain("getting-started.md");
		expect(read("docs/docs-map.md")).toContain("getting-started.md");
	});

	it("LSG-REL34: all build-diagrams SVGs exist", () => {
		const script = read("scripts/build-diagrams.mjs");
		const names = [...script.matchAll(/"([^"]+\.mmd)"/g)].map((m) => m[1].replace(".mmd", ".svg"));
		for (const svg of names) {
			expect(existsSync(join(rootDir, "docs/img", svg))).toBe(true);
		}
	});

	it("LSG-REL35: FAQ Action line uses package version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(read("docs/faq.md")).toContain(`@v${pkg.version}`);
	});

	it("LSG-REL36: action README inputs match action.yml", () => {
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
		for (const out of [
			"violations",
			"drift-count",
			"static-findings",
			"sarif-path",
			"policy-changed",
		]) {
			expect(readme).toContain(out);
		}
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(readme).toContain(`@v${pkg.version}`);
	});

	it("LSG-REL37: cookbook §13 links troubleshooting doc", () => {
		expect(read("docs/integration-cookbook.md")).toContain("troubleshooting.md");
	});

	it("LSG-REL38: schemas README linked from policy-reference or docs-map", () => {
		const policy = read("docs/policy-reference.md");
		const map = read("docs/docs-map.md");
		expect(policy.includes("schemas/README.md") || map.includes("schemas/README.md")).toBe(true);
	});

	it("LSG-REL39: testing-strategy documents LSG-DOC01–35", () => {
		const doc = read("docs/testing-strategy.md");
		expect(doc).toMatch(/LSG-DOC01|DOC01–DOC35|DOC01–35/);
	});

	it("LSG-REL40: README Documentation links troubleshooting", () => {
		const section = read("README.md").split("## Documentation")[1] ?? "";
		expect(section).toContain("troubleshooting.md");
	});

	it("LSG-REL41: npm pack includes schemas README", () => {
		const output = execFileSync("npm", ["pack", "--dry-run", "--json"], {
			cwd: rootDir,
			encoding: "utf8",
		});
		const [pack] = JSON.parse(output) as Array<{ files: Array<{ path: string }> }>;
		expect(pack.files.map((f) => f.path)).toContain("schemas/README.md");
	}, 30_000);

	it("LSG-REL42: no stale action pins in consumer docs", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		const stale = /llm-stream-guard\/action@v0\.([0-7]|8\.0|8\.1)\b/;
		for (const file of ["action/README.md", "docs/ci-github-action.md", "docs/faq.md"]) {
			const text = read(file);
			expect(text).toContain(`@v${pkg.version}`);
			expect(stale.test(text), file).toBe(false);
		}
	});

	it("LSG-REL43: release-prep includes doc gate checks", () => {
		const script = read("scripts/release-prep.mjs");
		expect(script).toContain("docs-readiness");
		expect(script).toContain("troubleshooting");
	});

	it("LSG-REL44: docs-edge-cases test file covers DOC-E09–E55", () => {
		const source = read("test/docs-edge-cases.test.ts");
		expect(source).toMatch(/DOC-E09/);
		expect(source).toMatch(/DOC-E55/);
		expect(source).toContain("check-doc-links");
	});
});
