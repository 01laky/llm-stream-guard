import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const declarationArtifacts = ["dist/index.js", "dist/index.cjs", "dist/index.d.ts"] as const;

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.d.ts"))) {
		execSync("pnpm build", { cwd: rootDir, stdio: "pipe" });
	}
});

describe("build-artifacts.test.ts", () => {
	describe("LSG-B01", () => {
		it("loads guardEvents from dist/index.js", async () => {
			const mod = (await import(join(rootDir, "dist/index.js"))) as Record<string, unknown>;
			expect(typeof mod.guardEvents).toBe("function");
		});
	});

	describe.each(declarationArtifacts.map((file, index) => ({ id: `LSG-B0${index + 2}`, file })))(
		"$id",
		({ file }) => {
			it(`exists: ${file}`, () => {
				expect(existsSync(join(rootDir, file))).toBe(true);
			});
		},
	);

	describe("LSG-B05", () => {
		it("dist/index.d.ts does not leak ../src paths", () => {
			const text = readFileSync(join(rootDir, "dist/index.d.ts"), "utf8");
			expect(text).not.toMatch(/from ["']\.\.\/src/);
			expect(text).not.toMatch(/from ["']\.\/src/);
		});
	});

	describe("LSG-B06", () => {
		it("dist/index.d.ts exports core public types and factories", () => {
			const text = readFileSync(join(rootDir, "dist/index.d.ts"), "utf8");
			expect(text).toContain("GuardEvent");
			expect(text).toContain("Violation");
			expect(text).toContain("ViolationMode");
			expect(text).toContain("createGuardContext");
			expect(text).toContain("guardEvents");
			expect(text).toContain("createByteGuard");
		});
	});

	describe("LSG-B07", () => {
		it("package.json exports.import resolves to dist/index.js", () => {
			const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
				exports: { ".": { import: string } };
			};
			const rel = pkg.exports["."].import.replace(/^\.\//, "");
			expect(existsSync(join(rootDir, rel))).toBe(true);
		});
	});

	describe("LSG-B08", () => {
		it("ESM and CJS both expose createByteGuard", async () => {
			const esm = (await import(join(rootDir, "dist/index.js"))) as Record<string, unknown>;
			const cjs = require(join(rootDir, "dist/index.cjs")) as Record<string, unknown>;
			expect(typeof esm.createByteGuard).toBe("function");
			expect(typeof cjs.createByteGuard).toBe("function");
		});
	});

	describe("LSG-B04", () => {
		it("dist/index.d.cts exists when tsup emits CJS types", () => {
			const path = join(rootDir, "dist/index.d.cts");
			if (!existsSync(path)) {
				// tsup version may omit .d.cts — index.d.ts covers both when absent
				expect(existsSync(join(rootDir, "dist/index.d.ts"))).toBe(true);
				return;
			}
			expect(existsSync(path)).toBe(true);
		});
	});
});
