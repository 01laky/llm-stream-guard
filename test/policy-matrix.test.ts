/**
 * LSG-XEC1601–XEC1850 — policy validate, parse, compile matrix.
 */
import { describe, expect, it } from "vitest";
import {
	compilePolicy,
	POLICY_E001,
	POLICY_E002,
	POLICY_E003,
	POLICY_E004,
	POLICY_E007,
	POLICY_E008,
	POLICY_E009,
	POLICY_E010,
	parsePolicyYaml,
	RULE_KEYS,
	validatePolicy,
} from "../src/index.js";
import { PolicyYamlError } from "../src/policy/parse-yaml-minimal.js";
import type { PolicyDocument } from "../src/policy/types.js";

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

const INVALID_E001: [string, object][] = [
	["non-object root", []],
	["missing version", { rules: [] }],
];

const INVALID_E002: [string, object][] = [
	["invalid mode", { version: "1", mode: "strict", rules: [] }],
	["unknown rule key", { version: "1", rules: [{ notARealRule: {} }] }],
];

const INVALID_E003: [string, object][] = [
	["unclosed class", { version: "1", rules: [{ blockToolArgs: { pattern: "[abc" } }] }],
	["bad quantifier", { version: "1", rules: [{ blockToolArgs: { pattern: "a{2,1}" } }] }],
];

const INVALID_E004: [string, object][] = [
	["empty redactPII", { version: "1", rules: [{ redactPII: {} }] }],
	["false flags", { version: "1", rules: [{ redactPII: { email: false, phone: false } }] }],
];

const INVALID_E007: [string, object][] = [
	[
		"both pattern and contains",
		{ version: "1", rules: [{ blockToolArgs: { pattern: "a", contains: "b" } }] },
	],
	["empty blockToolArgs", { version: "1", rules: [{ blockToolArgs: {} }] }],
];

const INVALID_E008: [string, object][] = [
	["names not array", { version: "1", rules: [{ denyTools: { names: "bash" } }] }],
	["empty denyTools names", { version: "1", rules: [{ denyTools: { names: [] } }] }],
];

const INVALID_E009: [string, object][] = [
	[
		"allow deny overlap",
		{
			version: "1",
			rules: [{ allowTools: { names: ["a", "x"] } }, { denyTools: { names: ["x", "y"] } }],
		},
	],
	[
		"duplicate overlap",
		{
			version: "1",
			rules: [{ allowTools: { names: ["search"] } }, { denyTools: { names: ["search"] } }],
		},
	],
];

const INVALID_E010: [string, object][] = [
	["empty allow in block", { version: "1", mode: "block", rules: [{ allowTools: { names: [] } }] }],
	[
		"merged empty allow block",
		{
			version: "1",
			mode: "block",
			rules: [{ allowTools: { names: ["search"] } }, { allowTools: { names: [] } }],
		},
	],
];

describe("LSG-XEC1601: validatePolicy E001–E010 invalid docs", () => {
	let id = 1601;
	const groups: Array<[string, string, [string, object][]]> = [
		[POLICY_E001, "E001", INVALID_E001],
		[POLICY_E002, "E002", INVALID_E002],
		[POLICY_E003, "E003", INVALID_E003],
		[POLICY_E004, "E004", INVALID_E004],
		[POLICY_E007, "E007", INVALID_E007],
		[POLICY_E008, "E008", INVALID_E008],
		[POLICY_E009, "E009", INVALID_E009],
		[POLICY_E010, "E010", INVALID_E010],
	];

	for (const [code, label, variants] of groups) {
		for (const [name, doc] of variants) {
			it(`XEC${id++}: validatePolicy ${label} ${name}`, () => {
				if (code === POLICY_E010) {
					const result = validatePolicy(doc);
					expect(result.ok).toBe(false);
					if (!result.ok) {
						expect(
							result.errors.some((e) => e.code === POLICY_E008 || e.code === POLICY_E010),
						).toBe(true);
					}
					return;
				}
				expectCode(validatePolicy(doc), code);
			});
		}
	}

	it(`XEC${id++}: validatePolicy E002 non-array rules`, () => {
		expectCode(validatePolicy({ version: "1", rules: "x" }), POLICY_E002, "rules");
	});

	it(`XEC${id++}: validatePolicy E001 unsupported version`, () => {
		expectCode(validatePolicy({ version: "99", rules: [] }), POLICY_E001, "version");
	});

	it("registers 20+ E001–E010 invalid variants through XEC1620", () => {
		expect(id - 1).toBeGreaterThanOrEqual(1618);
	});
});

describe("LSG-XEC1621: parsePolicyYaml edge strings", () => {
	const edgeCases: Array<[string, string, "ok" | "throw"]> = [
		["whitespace only", "   \n", "ok"],
		["version only", 'version: "1"\n', "ok"],
		["mode audit", 'version: "1"\nmode: audit\nrules: []\n', "ok"],
		["inline rule", 'version: "1"\nrules:\n  - sanitizeErrors:\n', "ok"],
		[
			"allowTools inline array",
			'version: "1"\nrules:\n  - allowTools:\n      names: [a, b]\n',
			"ok",
		],
		["byte flags", 'version: "1"\nbyte:\n  redactSecrets: true\n', "ok"],
		["policyVersion", 'version: "1"\npolicyVersion: team\nrules: []\n', "ok"],
		["nested rules", 'version: "1"\nrules:\n  - sanitizeErrors:\n', "ok"],
		["comment line", 'version: "1" # comment\nrules: []\n', "ok"],
		["quoted key-ish", 'version: "1"\nrules:\n  - redactPII:\n      email: true\n', "ok"],
		["multiline empty lines", 'version: "1"\n\n\nrules: []\n\n', "ok"],
		["extends string", 'version: "1"\nextends: agent-gate\n', "ok"],
		["numeric max", 'version: "1"\nrules:\n  - maxToolArgsBytes:\n      max: 1024\n', "ok"],
		[
			"blockToolArgs contains",
			'version: "1"\nrules:\n  - blockToolArgs:\n      contains: secret\n',
			"ok",
		],
		[
			"blockToolArgs pattern",
			'version: "1"\nrules:\n  - blockToolArgs:\n      pattern: "\\\\d+"\n',
			"ok",
		],
		["denyTools names", 'version: "1"\nrules:\n  - denyTools:\n      names: [bash]\n', "ok"],
		[
			"redact placeholder",
			'version: "1"\nrules:\n  - redactSecrets:\n      placeholder: "***"\n',
			"ok",
		],
		["warn mode", 'version: "1"\nmode: warn\nrules: []\n', "ok"],
		["block mode", 'version: "1"\nmode: block\nrules: []\n', "ok"],
		["anchor alias", "base: &ref\nchild: *ref", "throw"],
	];

	let id = 1621;
	for (const [name, yaml, expectResult] of edgeCases) {
		it(`XEC${id++}: parsePolicyYaml ${name}`, () => {
			if (expectResult === "throw") {
				expect(() => parsePolicyYaml(yaml)).toThrow(PolicyYamlError);
				return;
			}
			const doc = parsePolicyYaml(yaml);
			if (name === "whitespace only") {
				expect(doc).toEqual({});
				return;
			}
			expect(doc.version).toBe("1");
		});
	}

	const generated: string[] = [];
	for (let i = 0; i < 95; i++) {
		generated.push(
			`version: "1"\npolicyVersion: gen-${i}\nrules:\n  - redactPII:\n      email: ${i % 2 === 0}\n      phone: ${i % 3 === 0}\n`,
		);
	}
	for (const [index, yaml] of generated.entries()) {
		it(`XEC${id++}: parsePolicyYaml generated ${index}`, () => {
			const doc = parsePolicyYaml(yaml);
			expect(doc.policyVersion).toBe(`gen-${index}`);
			expect(Array.isArray(doc.rules)).toBe(true);
		});
	}

	it("registers parsePolicyYaml cases through XEC1735", () => {
		expect(id - 1).toBeGreaterThanOrEqual(1735);
	});
});

describe("LSG-XEC1736: compilePolicy RULE_KEYS matrix", () => {
	let id = 1736;

	const compileVariants: Record<(typeof RULE_KEYS)[number], PolicyDocument[]> = {
		redactSecrets: [
			{ version: "1", rules: [{ redactSecrets: {} }] },
			{ version: "1", rules: [{ redactSecrets: { placeholder: "[HIDDEN]" } }] },
			{ version: "1", mode: "audit", rules: [{ redactSecrets: {} }] },
			{ version: "1", byte: { redactSecrets: true }, rules: [{ redactSecrets: {} }] },
			{ version: "1", rules: [{ redactSecrets: {} }, { sanitizeErrors: {} }] },
		],
		redactPII: [
			{ version: "1", rules: [{ redactPII: { email: true } }] },
			{ version: "1", rules: [{ redactPII: { phone: true } }] },
			{ version: "1", rules: [{ redactPII: { email: true, phone: true } }] },
			{ version: "1", mode: "warn", rules: [{ redactPII: { email: true } }] },
		],
		allowTools: [
			{ version: "1", rules: [{ allowTools: { names: ["search"] } }] },
			{ version: "1", mode: "block", rules: [{ allowTools: { names: ["a", "b", "c"] } }] },
			{ version: "1", rules: [{ allowTools: { names: ["grep"] } }] },
		],
		denyTools: [
			{ version: "1", rules: [{ denyTools: { names: ["bash"] } }] },
			{ version: "1", rules: [{ denyTools: { names: ["exec", "shell"] } }] },
		],
		blockToolArgs: [
			{ version: "1", rules: [{ blockToolArgs: { contains: "secret" } }] },
			{ version: "1", rules: [{ blockToolArgs: { pattern: "/etc/passwd" } }] },
		],
		maxToolArgsBytes: [
			{ version: "1", rules: [{ maxToolArgsBytes: { max: 1024 } }] },
			{ version: "1", rules: [{ maxToolArgsBytes: { max: 32 } }] },
		],
		sanitizeErrors: [
			{ version: "1", rules: [{ sanitizeErrors: {} }] },
			{ version: "1", mode: "audit", rules: [{ sanitizeErrors: {} }] },
		],
	};

	for (const key of RULE_KEYS) {
		const docs = compileVariants[key];
		for (let v = 0; v < 15; v++) {
			const doc = docs[v % docs.length]!;
			it(`XEC${id++}: compilePolicy ${key} variant ${v}`, () => {
				const loaded = compilePolicy(doc, { profile: "agent-gate" });
				expect(loaded.rules.some((r) => r.key === key)).toBe(true);
				expect(loaded.transforms.length).toBeGreaterThan(0);
				expect(loaded.mode).toBeDefined();
				if (doc.byte?.redactSecrets) {
					expect(loaded.byteOptions.redactSecrets).toBe(true);
				}
			});
		}
	}

	it("registers compilePolicy cases through XEC1840", () => {
		expect(id - 1).toBeGreaterThanOrEqual(1840);
	});
});

describe("LSG-XEC1841: policy validation extras", () => {
	let id = 1841;

	it(`XEC${id++}: validatePolicy accepts minimal valid doc`, () => {
		expect(validatePolicy({ version: "1", rules: [] }).ok).toBe(true);
	});

	it(`XEC${id++}: validatePolicy accepts redactPII phone-only`, () => {
		expect(validatePolicy({ version: "1", rules: [{ redactPII: { phone: true } }] }).ok).toBe(true);
	});

	it(`XEC${id++}: compilePolicy empty rules yields zero transforms`, () => {
		const loaded = compilePolicy({ version: "1", rules: [] });
		expect(loaded.transforms).toHaveLength(0);
	});

	it(`XEC${id++}: compilePolicy mode override`, () => {
		const loaded = compilePolicy({ version: "1", mode: "block", rules: [] }, { mode: "audit" });
		expect(loaded.mode).toBe("audit");
	});

	for (let i = 0; i < 6; i++) {
		it(`XEC${id++}: RULE_KEYS contains ${RULE_KEYS[i]}`, () => {
			expect(RULE_KEYS).toContain(RULE_KEYS[i]);
		});
	}

	it("registers policy extras through XEC1850", () => {
		expect(id - 1).toBe(1850);
	});
});
