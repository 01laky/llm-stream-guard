import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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
