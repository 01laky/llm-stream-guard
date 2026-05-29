import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execSync("pnpm build", { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-S06: dist exports", () => {
	it("ESM root import exposes public API", async () => {
		const mod = (await import("../dist/index.js")) as Record<string, unknown>;
		expect(typeof mod.guardEvents).toBe("function");
		expect(typeof mod.createByteGuard).toBe("function");
		expect(typeof mod.createGuardContext).toBe("function");
		expect(typeof mod.pipeGuard).toBe("function");
		expect(typeof mod.redactSecrets).toBe("function");
		expect(typeof mod.allowTools).toBe("function");
		expect(typeof mod.loadPolicy).toBe("function");
		expect(typeof mod.createGuardFromPolicy).toBe("function");
		expect(typeof mod.validatePolicy).toBe("function");
		expect(typeof mod.summarizeGuardContext).toBe("function");
		expect(mod.applyGuardTransforms).toBeUndefined();
	});

	it("CJS root require exposes public API", () => {
		const mod = require("../dist/index.cjs") as Record<string, unknown>;
		expect(typeof mod.guardEvents).toBe("function");
		expect(typeof mod.createByteGuard).toBe("function");
		expect(typeof mod.createGuardContext).toBe("function");
		expect(typeof mod.pipeGuard).toBe("function");
	});
});

describe("LSG-S08: ./audit ESM import", () => {
	it("exposes audit static scan API", async () => {
		const mod = (await import("../dist/audit/index.js")) as Record<string, unknown>;
		expect(typeof mod.runStaticScan).toBe("function");
		expect(typeof mod.walkManifestFiles).toBe("function");
		expect(typeof mod.computeDrift).toBe("function");
		expect(typeof mod.validateManifestDocument).toBe("function");
	});
});

describe("LSG-S09: ./audit CJS require", () => {
	it("exposes audit static scan API", () => {
		const mod = require("../dist/audit/index.cjs") as Record<string, unknown>;
		expect(typeof mod.runStaticScan).toBe("function");
		expect(typeof mod.staticScanToSarif).toBe("function");
	});
});

describe("LSG-S10: root does not export audit internals", () => {
	it("runStaticScan is not on root export", async () => {
		const mod = (await import("../dist/index.js")) as Record<string, unknown>;
		expect(mod.runStaticScan).toBeUndefined();
		expect(mod.walkManifestFiles).toBeUndefined();
	});
});

describe("LSG-S11: audit types in dist/audit/index.d.ts", () => {
	it("exports StaticScanReport and DriftFinding types", () => {
		const text = readFileSync(join(rootDir, "dist/audit/index.d.ts"), "utf8");
		expect(text).toContain("StaticScanReport");
		expect(text).toContain("DriftFinding");
	});
});
