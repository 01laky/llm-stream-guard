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

	it("LSG-REL04: README scaffold status matches package.json version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		expect(read("README.md")).toContain(`**${pkg.version} scaffold**`);
	});

	it("LSG-REL05: README core and status badges match package.json version", () => {
		const pkg = JSON.parse(read("package.json")) as { version: string };
		const readme = read("README.md");
		expect(readme).toContain(`core-${pkg.version}-orange`);
		expect(readme).toContain(`status-${pkg.version}_scaffold-orange`);
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

	it("LSG-REL11: release-prep validates scaffold orange badges", () => {
		const script = read("scripts/release-prep.mjs");
		expect(script).toContain("_scaffold-orange");
		expect(script).toContain("core-${version}-orange");
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
});
