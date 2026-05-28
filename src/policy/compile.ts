import {
	allowTools,
	blockToolArgs,
	denyTools,
	maxToolArgsBytes,
	redactPII,
	redactSecrets,
	sanitizeErrors,
} from "../rules/index.js";
import { blockToolArgsMatcherFromParams } from "./block-tool-args-matcher.js";
import type { GuardTransform, ViolationMode } from "../types.js";
import type { ByteGuardOptions } from "../types.js";
import type { LoadedPolicy, NormalizedRule, PolicyDocument, PolicyRuleEntry } from "./types.js";

function normalizeRules(rules: PolicyRuleEntry[]): NormalizedRule[] {
	return rules.map((entry) => {
		const key = Object.keys(entry)[0]!;
		return { key, params: { ...entry[key]! } };
	});
}

function compileRule(entry: PolicyRuleEntry): GuardTransform {
	const key = Object.keys(entry)[0]!;
	const params = entry[key]!;

	switch (key) {
		case "redactSecrets":
			return redactSecrets(
				params.placeholder ? { placeholder: params.placeholder as string } : undefined,
			);
		case "redactPII":
			return redactPII({
				email: params.email === true,
				phone: params.phone === true,
			});
		case "allowTools":
			return allowTools(params.names as string[]);
		case "denyTools":
			return denyTools(params.names as string[]);
		case "blockToolArgs": {
			const matcher = blockToolArgsMatcherFromParams(params);
			if (matcher?.pattern) return blockToolArgs(matcher.pattern);
			if (matcher?.contains) return blockToolArgs(matcher.contains);
			throw new Error("blockToolArgs requires pattern or contains");
		}
		case "maxToolArgsBytes":
			return maxToolArgsBytes(params.max as number);
		case "sanitizeErrors":
			return sanitizeErrors();
		default:
			throw new Error(`Unknown rule key: ${key}`);
	}
}

function resolveMode(doc: PolicyDocument, override?: ViolationMode): ViolationMode {
	if (override) return override;
	return doc.mode ?? "block";
}

function compileByteOptions(doc: PolicyDocument, mode: ViolationMode): ByteGuardOptions {
	const byte = doc.byte ?? {};
	return {
		mode,
		redactSecrets: byte.redactSecrets === true,
		sanitizeErrors: byte.sanitizeErrors === true,
	};
}

export function compilePolicy(
	doc: PolicyDocument,
	options?: { mode?: ViolationMode; profile?: string },
): LoadedPolicy {
	const mode = resolveMode(doc, options?.mode);
	const rules = doc.rules ?? [];
	const transforms = rules.map(compileRule);

	const loaded: LoadedPolicy = {
		version: doc.version ?? "1",
		mode,
		byteOptions: compileByteOptions(doc, mode),
		transforms,
		rules: normalizeRules(rules),
	};
	if (doc.policyVersion !== undefined) loaded.policyVersion = doc.policyVersion;
	if (options?.profile !== undefined) loaded.profile = options.profile;
	return loaded;
}

export function applyModeOverride(
	mode: ViolationMode,
	options?: { mode?: ViolationMode },
): ViolationMode {
	const envMode = process.env.GUARD_MODE;
	if (envMode === "block" || envMode === "warn" || envMode === "audit") {
		return envMode;
	}
	if (options?.mode) return options.mode;
	return mode;
}
