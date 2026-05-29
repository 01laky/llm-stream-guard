/**
 * LSG-COV176–COV185 — JSON schema mirrors vs validatePolicy / manifest validation.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { validateManifestDocument } from "../src/audit/validate-manifest.js";
import {
	POLICY_E001,
	POLICY_E002,
	POLICY_E003,
	POLICY_E004,
	POLICY_E005,
	POLICY_E006,
	POLICY_E007,
	POLICY_E008,
	POLICY_E009,
	POLICY_E010,
	POLICY_E011,
	RULE_KEYS,
	validatePolicy,
} from "../src/index.js";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const policySchema = JSON.parse(
	readFileSync(join(rootDir, "schemas/policy-v1.json"), "utf8"),
) as Record<string, unknown>;
const manifestSchema = JSON.parse(
	readFileSync(join(rootDir, "schemas/tools-manifest-v1.json"), "utf8"),
) as Record<string, unknown>;
const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf8")) as {
	files: string[];
};

function fixture(path: string): string {
	return join(rootDir, "test/fixtures/policies", path);
}

function expectCode(
	result: ReturnType<typeof validatePolicy>,
	code: string,
	pathFragment?: string,
): void {
	expect(result.ok).toBe(false);
	if (!result.ok) {
		const match = result.errors.find((e) => e.code === code);
		expect(match, `expected ${code}`).toBeDefined();
		if (pathFragment) expect(match?.path).toContain(pathFragment);
	}
}

function ruleKeysFromSchema(): string[] {
	const rules = (policySchema.properties as Record<string, unknown>).rules as {
		items: { oneOf: Array<{ required: string[] }> };
	};
	return rules.items.oneOf.map((item) => item.required[0]!).sort();
}

beforeAll(() => {
	if (!existsSync(join(rootDir, "dist/index.js"))) {
		execFileSync("pnpm", ["build"], { cwd: rootDir, stdio: "pipe" });
	}
});

describe("LSG-COV176: policy schema version", () => {
	it('schema version const matches validatePolicy "1" requirement', () => {
		const version = (policySchema.properties as Record<string, { const?: string }>).version;
		expect(version?.const).toBe("1");
		expectCode(validatePolicy({ version: "2", rules: [] }), POLICY_E001, "version");
	});
});

describe("LSG-COV177: policy schema mode enum", () => {
	it("schema mode enum matches validatePolicy accepted modes", () => {
		const mode = (policySchema.properties as Record<string, { enum?: string[] }>).mode;
		expect(mode?.enum).toEqual(["block", "warn", "audit"]);
		expect(validatePolicy({ version: "1", mode: "block", rules: [] }).ok).toBe(true);
		expect(validatePolicy({ version: "1", mode: "warn", rules: [] }).ok).toBe(true);
		expectCode(validatePolicy({ version: "1", mode: "off", rules: [] }), POLICY_E002, "mode");
	});
});

describe("LSG-COV178: policy schema rules vs RULE_KEYS", () => {
	it("oneOf rule keys align with RULE_KEYS export", () => {
		const fromSchema = ruleKeysFromSchema();
		expect(fromSchema).toEqual([...RULE_KEYS].sort());
		for (const key of RULE_KEYS) {
			expect(fromSchema).toContain(key);
		}
	});
});

describe("LSG-COV179: minimal.json passes validatePolicy", () => {
	it("valid fixture minimal.json validates", () => {
		const doc = JSON.parse(readFileSync(fixture("valid/minimal.json"), "utf8"));
		const result = validatePolicy(doc);
		expect(result.ok).toBe(true);
	});
});

describe("LSG-COV180: invalid fixtures fail with registry codes", () => {
	it("missing-version.json → POLICY_E001", () => {
		expectCode(
			validatePolicy(JSON.parse(readFileSync(fixture("invalid/missing-version.json"), "utf8"))),
			POLICY_E001,
		);
	});

	it("bad-regexp.json → POLICY_E003", () => {
		expectCode(
			validatePolicy(JSON.parse(readFileSync(fixture("invalid/bad-regexp.json"), "utf8"))),
			POLICY_E003,
		);
	});

	it("allow-deny-overlap.json → POLICY_E009", () => {
		expectCode(
			validatePolicy(JSON.parse(readFileSync(fixture("invalid/allow-deny-overlap.json"), "utf8"))),
			POLICY_E009,
		);
	});

	it("empty-allow-block.json → POLICY_E010 or POLICY_E008", () => {
		const result = validatePolicy(
			JSON.parse(readFileSync(fixture("invalid/empty-allow-block.json"), "utf8")),
		);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errors.some((e) => e.code === POLICY_E010 || e.code === POLICY_E008)).toBe(
				true,
			);
		}
	});

	it("inline redactPII without flags → POLICY_E004", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ redactPII: {} }] }), POLICY_E004);
	});

	it("inline blockToolArgs empty → POLICY_E007", () => {
		expectCode(validatePolicy({ version: "1", rules: [{ blockToolArgs: {} }] }), POLICY_E007);
	});
});

describe("LSG-COV181: manifest schema required fields", () => {
	it("schema requires version and tools", () => {
		expect(manifestSchema.required).toEqual(["version", "tools"]);
		expect(validateManifestDocument({ version: "1" }).some((e) => e.path === "tools")).toBe(true);
		expect(
			validateManifestDocument({ tools: [{ name: "x" }] }).some((e) => e.path === "version"),
		).toBe(true);
	});
});

describe("LSG-COV182: manifest schema tools minItems", () => {
	it("schema minItems 1 matches validateManifestDocument empty tools rejection", () => {
		const tools = (manifestSchema.properties as Record<string, { minItems?: number }>).tools;
		expect(tools?.minItems).toBe(1);
		expect(validateManifestDocument({ version: "1", tools: [] }).length).toBeGreaterThan(0);
	});
});

describe("LSG-COV183: manifest schema tool name minLength", () => {
	it("schema name minLength 1 matches validateManifestDocument empty name rejection", () => {
		const items = (
			manifestSchema.properties as Record<
				string,
				{ items: { properties: Record<string, { minLength?: number }> } }
			>
		).tools.items;
		expect(items.properties.name?.minLength).toBe(1);
		expect(
			validateManifestDocument({ version: "1", tools: [{ name: "" }] }).some(
				(e) => e.path === "tools[0].name",
			),
		).toBe(true);
	});
});

describe("LSG-COV184: schemas in package files", () => {
	it('package.json "files" includes schemas directory', () => {
		expect(pkg.files).toContain("schemas");
		expect(existsSync(join(rootDir, "schemas/policy-v1.json"))).toBe(true);
		expect(existsSync(join(rootDir, "schemas/tools-manifest-v1.json"))).toBe(true);
	});
});

describe("LSG-COV185: POLICY_E001–E011 exported from index", () => {
	it("exports stable POLICY_E001 through POLICY_E011 codes", () => {
		const codes = [
			POLICY_E001,
			POLICY_E002,
			POLICY_E003,
			POLICY_E004,
			POLICY_E005,
			POLICY_E006,
			POLICY_E007,
			POLICY_E008,
			POLICY_E009,
			POLICY_E010,
			POLICY_E011,
		];
		for (const code of codes) {
			expect(code).toMatch(/^POLICY_E\d{3}$/);
		}
		expect(POLICY_E011).toBe("POLICY_E011");
	});
});
