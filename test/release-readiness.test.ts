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

	it("LSG-REL45: README tests badge ≥ 4000", () => {
		const readme = read("README.md");
		const m = readme.match(/tests-(\d+)_passing/);
		expect(m).toBeTruthy();
		expect(Number(m![1])).toBeGreaterThanOrEqual(4000);
	});

	it("LSG-REL46: edge-cases-exhaustive.test.ts exists with XEC001", () => {
		expect(read("test/edge-cases-exhaustive.test.ts")).toMatch(/XEC001/);
	});

	it("LSG-REL47: testing-strategy documents Phase 9 test fortress", () => {
		const doc = read("docs/testing-strategy.md");
		expect(doc).toMatch(/Phase 9|0\.9\.0|LSG-XEC/);
		expect(doc).toMatch(/4157|4114|4000|≥4000/);
	});

	it("LSG-REL48: CHANGELOG documents 0.9.0 test fortress", () => {
		expect(read("CHANGELOG.md")).toMatch(/## \[0\.9\.0\]/);
		expect(read("CHANGELOG.md")).toMatch(/test fortress|LSG-XEC/i);
	});

	it("LSG-REL49: fixture registry has ≥ 80 table rows", () => {
		const registry = read("test/fixtures/REGISTRY.md");
		const rows = registry.match(/^\| LSG-/gm) ?? [];
		expect(rows.length).toBeGreaterThanOrEqual(80);
	});

	it("LSG-REL50: matrix test files exist", () => {
		for (const f of [
			"byte-split-matrix.test.ts",
			"policy-matrix.test.ts",
			"cli-matrix.test.ts",
			"audit-matrix.test.ts",
			"action-matrix.test.ts",
		]) {
			expect(existsSync(join(rootDir, "test", f))).toBe(true);
		}
	});

	it("LSG-REL51: test-count-gate script wired", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["test:count-gate"]).toContain("test-count-gate.mjs");
		expect(read("scripts/test-count-gate.mjs")).toContain("--min");
	});

	it("LSG-REL52: test-timing-smoke script exists", () => {
		expect(read("scripts/test-timing-smoke.mjs")).toMatch(/480000|max-ms/);
	});

	it("LSG-REL53: audit-test-coverage-map script wired in verify", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["test:coverage-map"]).toContain("audit-test-coverage-map.mjs");
		expect(pkg.scripts.verify).toContain("test:coverage-map");
	});

	it("LSG-REL54: golden-runner helper exists", () => {
		expect(read("test/helpers/golden-runner.ts")).toContain("runByteGolden");
	});

	it("LSG-REL55: property-invariants test file exists", () => {
		expect(read("test/property-invariants.test.ts")).toMatch(/PROP01/);
	});

	it("LSG-REL56: json-regression test file exists", () => {
		expect(read("test/json-regression.test.ts")).toMatch(/COV451/);
	});

	it("LSG-REL57: package-tarball test file exists", () => {
		expect(read("test/package-tarball.test.ts")).toMatch(/PKG01/);
	});

	it("LSG-REL58: security-negative test file exists", () => {
		expect(read("test/security-negative.test.ts")).toMatch(/SEC01/);
	});

	it("LSG-REL59: CBK44 examples matrix in cookbook tests", () => {
		const src = read("test/cookbook-recipes.test.ts");
		expect(src).toMatch(/CBK44|byte-proxy\/hono/);
	});

	it("LSG-REL60: version sync 1.0.0", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(pkg.version).toBe("1.0.0");
		expect(read("src/version.ts")).toContain("1.0.0");
		expect(read("README.md")).toContain("1.0.0");
	});

	it("LSG-REL61: zero runtime deps unchanged", () => {
		const pkg = JSON.parse(read("package.json")) as {
			dependencies?: unknown;
			peerDependencies?: unknown;
		};
		expect(pkg.dependencies).toBeUndefined();
		expect(pkg.peerDependencies).toBeUndefined();
	});

	it("LSG-REL62: verify includes test:count-gate", () => {
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts.verify).toContain("test:count-gate");
	});

	it("LSG-REL63: stream-reporting test file RPT01", () => {
		expect(read("test/stream-reporting.test.ts")).toMatch(/RPT01/);
	});

	it("LSG-REL64: sarif-stable test file SAR01", () => {
		expect(read("test/sarif-stable.test.ts")).toMatch(/SAR01/);
	});

	it("LSG-REL65: schema-contract test file SCH01", () => {
		expect(read("test/schema-contract.test.ts")).toMatch(/SCH01/);
	});

	it("LSG-REL66: doctor test file DTR01", () => {
		expect(read("test/doctor.test.ts")).toMatch(/DTR01/);
	});

	it("LSG-REL67: gate stable language script", () => {
		expect(existsSync(join(rootDir, "scripts/grep-stable-gate.mjs"))).toBe(true);
		const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
		expect(pkg.scripts["gate:stable-language"]).toBeDefined();
		expect(pkg.scripts.verify).toContain("gate:stable-language");
	});

	it("LSG-REL68: check-policy-profiles script", () => {
		expect(existsSync(join(rootDir, "scripts/check-policy-profiles.mjs"))).toBe(true);
		expect(existsSync(join(rootDir, "scripts/policy-profile-hashes.json"))).toBe(true);
	});

	it("LSG-REL69: phase10-report-matrix exists", () => {
		expect(read("test/phase10-report-matrix.test.ts")).toMatch(/RPT36/);
	});

	it("LSG-REL70: security-negative-b SEC21", () => {
		expect(read("test/security-negative-b.test.ts")).toMatch(/SEC21/);
	});

	it("LSG-REL71: api-stability doc Status 1.0.0", () => {
		expect(read("docs/api-stability.md")).toMatch(/Status.*1\.0\.0/);
	});

	it("LSG-REL72: threat-model.md replaces stub", () => {
		expect(existsSync(join(rootDir, "docs/threat-model.md"))).toBe(true);
		expect(existsSync(join(rootDir, "docs/threat-model-stub.md"))).toBe(false);
	});

	it("LSG-REL73: migration-0.x-to-1.0 doc", () => {
		expect(read("docs/migration-0.x-to-1.0.md")).toContain("1.0.0");
	});

	it("LSG-REL74: scan-report-v1 schema ships", () => {
		expect(existsSync(join(rootDir, "schemas/scan-report-v1.json"))).toBe(true);
	});

	it("LSG-REL75: static-scan-report-v1 schema ships", () => {
		expect(existsSync(join(rootDir, "schemas/static-scan-report-v1.json"))).toBe(true);
	});

	it("LSG-REL76: stream-guard-summary-v1 schema ships", () => {
		expect(existsSync(join(rootDir, "schemas/stream-guard-summary-v1.json"))).toBe(true);
	});

	it("LSG-REL77: sarif.ts canonical module", () => {
		expect(read("src/audit/sarif.ts")).toContain("SARIF_RULE_CATALOG");
	});

	it("LSG-REL78: on-finish-summary example", () => {
		expect(existsSync(join(rootDir, "examples/minimal-node/on-finish-summary.mjs"))).toBe(true);
	});

	it("LSG-REL79: CHANGELOG 1.0.0 section", () => {
		expect(read("CHANGELOG.md")).toContain("## [1.0.0]");
	});

	it("LSG-REL80: build-diagrams lists 21 mmd files", () => {
		const script = read("scripts/build-diagrams.mjs");
		const count = (script.match(/^\t"[^"]+\.mmd"/gm) ?? []).length;
		expect(count).toBe(21);
	});

	it("LSG-REL81: edge-cases-phase10-exhaustive XEC1201", () => {
		expect(read("test/edge-cases-phase10-exhaustive.test.ts")).toMatch(/XEC1201/);
	});

	it("LSG-REL82: phase10-audit-fixes AUD01", () => {
		expect(read("test/phase10-audit-fixes.test.ts")).toMatch(/AUD01/);
	});

	it("LSG-REL83: byte-sse-phase9-golden C9-G01", () => {
		expect(read("test/byte-sse-phase9-golden.test.ts")).toMatch(/C9-G01/);
	});

	it("LSG-REL84: edge-cases-phase10.1-exhaustive XEC2231", () => {
		expect(read("test/edge-cases-phase10.1-exhaustive.test.ts")).toMatch(/XEC2231/);
	});
});
