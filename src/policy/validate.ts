import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
	policyError,
	type PolicyValidationResult,
} from "./error-codes.js";
import { isRuleKey } from "./rule-keys.js";
import type { PolicyByteSection, PolicyDocument, PolicyRuleEntry } from "./types.js";
import type { ViolationMode } from "../types.js";

const VALID_MODES: ViolationMode[] = ["block", "warn", "audit"];

function isObject(v: unknown): v is Record<string, unknown> {
	return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateNamesArray(
	names: unknown,
	path: string,
	errors: ReturnType<typeof policyError>[],
): string[] | null {
	if (!Array.isArray(names)) {
		errors.push(policyError(POLICY_E008, path, "`names` must be an array"));
		return null;
	}
	const out: string[] = [];
	for (let i = 0; i < names.length; i++) {
		if (typeof names[i] !== "string") {
			errors.push(policyError(POLICY_E008, `${path}[${i}]`, "name must be a string"));
			return null;
		}
		out.push(names[i] as string);
	}
	return out;
}

function validateRuleEntry(
	entry: unknown,
	index: number,
	errors: ReturnType<typeof policyError>[],
): PolicyRuleEntry | null {
	const path = `rules[${index}]`;
	if (!isObject(entry)) {
		errors.push(policyError(POLICY_E002, path, "rule entry must be an object"));
		return null;
	}
	const keys = Object.keys(entry);
	if (keys.length !== 1) {
		errors.push(policyError(POLICY_E002, path, "rule entry must have exactly one key"));
		return null;
	}
	const key = keys[0]!;
	if (!isRuleKey(key)) {
		errors.push(policyError(POLICY_E002, `${path}.${key}`, `unknown rule key "${key}"`));
		return null;
	}
	const params = entry[key];
	if (!isObject(params)) {
		errors.push(policyError(POLICY_E002, `${path}.${key}`, "params must be an object"));
		return null;
	}

	switch (key) {
		case "redactSecrets":
			if (params.placeholder !== undefined && typeof params.placeholder !== "string") {
				errors.push(
					policyError(POLICY_E002, `${path}.redactSecrets.placeholder`, "must be string"),
				);
			}
			break;
		case "redactPII": {
			const email = params.email === true;
			const phone = params.phone === true;
			if (!email && !phone) {
				errors.push(
					policyError(
						POLICY_E004,
						`${path}.redactPII`,
						"at least one of email or phone must be true",
					),
				);
			}
			break;
		}
		case "allowTools":
		case "denyTools": {
			const names = validateNamesArray(params.names, `${path}.${key}.names`, errors);
			if (names && names.length === 0) {
				errors.push(policyError(POLICY_E008, `${path}.${key}.names`, "`names` must not be empty"));
			}
			break;
		}
		case "blockToolArgs": {
			const hasPattern = typeof params.pattern === "string";
			const hasContains = typeof params.contains === "string";
			if (hasPattern === hasContains) {
				errors.push(
					policyError(
						POLICY_E007,
						`${path}.blockToolArgs`,
						"exactly one of pattern or contains is required",
					),
				);
			} else if (hasPattern) {
				try {
					// eslint-disable-next-line no-new
					new RegExp(params.pattern as string);
				} catch {
					errors.push(
						policyError(POLICY_E003, `${path}.blockToolArgs.pattern`, "invalid regular expression"),
					);
				}
			}
			break;
		}
		case "maxToolArgsBytes": {
			const max = params.max;
			if (typeof max !== "number" || !Number.isInteger(max) || max <= 0) {
				errors.push(
					policyError(
						POLICY_E002,
						`${path}.maxToolArgsBytes.max`,
						"max must be a positive integer",
					),
				);
			}
			break;
		}
		case "sanitizeErrors":
			break;
	}

	return entry as PolicyRuleEntry;
}

function checkRuleConflicts(
	doc: PolicyDocument,
	mode: ViolationMode,
	errors: ReturnType<typeof policyError>[],
): void {
	const rules = doc.rules ?? [];
	let allowNames: string[] | undefined;
	let denyNames: string[] | undefined;
	for (const entry of rules) {
		const key = Object.keys(entry)[0]!;
		if (key === "allowTools") allowNames = entry.allowTools!.names as string[];
		if (key === "denyTools") denyNames = entry.denyTools!.names as string[];
	}
	if (allowNames && denyNames) {
		const overlap = allowNames.filter((n) => denyNames!.includes(n));
		if (overlap.length > 0) {
			errors.push(
				policyError(
					POLICY_E009,
					"rules",
					`allowTools and denyTools overlap: ${overlap.join(", ")}`,
				),
			);
		}
	}
	for (const entry of rules) {
		const key = Object.keys(entry)[0]!;
		if (key === "allowTools") {
			const names = entry.allowTools!.names as string[];
			if (names.length === 0 && mode === "block") {
				errors.push(
					policyError(
						POLICY_E010,
						"rules.allowTools.names",
						"empty allowlist with mode block denies all tools",
					),
				);
			}
		}
	}
}

export function validatePolicy(doc: unknown): PolicyValidationResult {
	const errors: ReturnType<typeof policyError>[] = [];
	if (!isObject(doc)) {
		return {
			ok: false,
			errors: [policyError(POLICY_E001, "", "policy must be an object")],
		};
	}

	if (doc.version === undefined && !doc.extends) {
		errors.push(policyError(POLICY_E001, "version", "version is required"));
	}

	const version = doc.version;
	if (version !== undefined && version !== "1") {
		errors.push(policyError(POLICY_E001, "version", `unsupported version "${String(version)}"`));
	}

	let mode: ViolationMode = "block";
	if (doc.mode !== undefined) {
		if (!VALID_MODES.includes(doc.mode as ViolationMode)) {
			errors.push(policyError(POLICY_E002, "mode", `invalid mode "${String(doc.mode)}"`));
		} else {
			mode = doc.mode as ViolationMode;
		}
	}

	if (doc.byte !== undefined) {
		if (!isObject(doc.byte)) {
			errors.push(policyError(POLICY_E002, "byte", "byte must be an object"));
		} else {
			for (const k of Object.keys(doc.byte)) {
				if (k !== "redactSecrets" && k !== "sanitizeErrors") {
					errors.push(policyError(POLICY_E002, `byte.${k}`, "unknown byte flag"));
				} else if (typeof doc.byte[k] !== "boolean") {
					errors.push(policyError(POLICY_E002, `byte.${k}`, "must be boolean"));
				}
			}
		}
	}

	if (doc.extends !== undefined && typeof doc.extends !== "string") {
		errors.push(policyError(POLICY_E002, "extends", "extends must be a string"));
	}

	if (doc.policyVersion !== undefined && typeof doc.policyVersion !== "string") {
		errors.push(policyError(POLICY_E002, "policyVersion", "must be a string"));
	}

	const rulesRaw = doc.rules;
	const rules: PolicyRuleEntry[] = [];
	if (rulesRaw !== undefined) {
		if (!Array.isArray(rulesRaw)) {
			errors.push(policyError(POLICY_E002, "rules", "rules must be an array"));
		} else {
			for (let i = 0; i < rulesRaw.length; i++) {
				const validated = validateRuleEntry(rulesRaw[i], i, errors);
				if (validated) rules.push(validated);
			}
		}
	}

	if (errors.length > 0) return { ok: false, errors };

	const policyDoc: PolicyDocument = {
		version: (version as string | undefined) ?? "1",
		mode,
		rules,
	};
	if (doc.policyVersion !== undefined) policyDoc.policyVersion = doc.policyVersion as string;
	if (doc.extends !== undefined) policyDoc.extends = doc.extends as string;
	if (doc.byte !== undefined && typeof doc.byte === "object") {
		policyDoc.byte = doc.byte as PolicyByteSection;
	}

	checkRuleConflicts(policyDoc, mode, errors);
	if (errors.length > 0) return { ok: false, errors };

	return { ok: true, document: policyDoc };
}

export { POLICY_E005, POLICY_E006 };
