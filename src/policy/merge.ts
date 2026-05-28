import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { POLICY_E005, POLICY_E006 } from "./error-codes.js";
import { parsePolicyFile } from "./parse-yaml-minimal.js";
import type { PolicyByteSection, PolicyDocument } from "./types.js";

export const MAX_EXTENDS_DEPTH = 8;

const BUILTIN_PROFILES = ["proxy-strict", "agent-gate", "audit-only"] as const;

export function listProfiles(): string[] {
	return [...BUILTIN_PROFILES];
}

export function getProfilePath(profileId: string): string | null {
	const here = dirname(fileURLToPath(import.meta.url));
	const candidates = [join(here, "profiles"), join(here, "policy", "profiles")];
	for (const dir of candidates) {
		const path = join(dir, `${profileId}.json`);
		if (existsSync(path)) return path;
	}
	return null;
}

export function loadProfileDocument(profileId: string): PolicyDocument {
	const path = getProfilePath(profileId);
	if (!path) throw new Error(`Unknown profile: ${profileId}`);
	return JSON.parse(readFileSync(path, "utf8")) as PolicyDocument;
}

function buildDocument(fields: {
	version: string;
	policyVersion?: string;
	mode?: PolicyDocument["mode"];
	byte?: PolicyByteSection;
	rules?: PolicyDocument["rules"];
	extends?: string;
}): PolicyDocument {
	const doc: PolicyDocument = { version: fields.version };
	if (fields.policyVersion !== undefined) doc.policyVersion = fields.policyVersion;
	if (fields.mode !== undefined) doc.mode = fields.mode;
	if (fields.byte !== undefined) doc.byte = fields.byte;
	if (fields.rules !== undefined) doc.rules = fields.rules;
	if (fields.extends !== undefined) doc.extends = fields.extends;
	return doc;
}

export function mergePolicyDocuments(
	base: PolicyDocument,
	override: PolicyDocument,
): PolicyDocument {
	const baseRules = [...(base.rules ?? [])];
	const overrideRules = override.rules ?? [];

	for (const entry of overrideRules) {
		const key = Object.keys(entry)[0]!;
		const idx = baseRules.findIndex((r) => Object.keys(r)[0] === key);
		if (idx === -1) baseRules.push(entry);
		else baseRules[idx] = entry;
	}

	const policyVersion = override.policyVersion ?? base.policyVersion;
	const mode = override.mode ?? base.mode;
	const byteMerged = { ...base.byte, ...override.byte };
	const hasByte = Object.keys(byteMerged).length > 0;

	return buildDocument({
		version: override.version ?? base.version ?? "1",
		...(policyVersion !== undefined ? { policyVersion } : {}),
		...(mode !== undefined ? { mode } : {}),
		...(hasByte ? { byte: byteMerged } : {}),
		rules: baseRules,
	});
}

export function resolveExtends(
	doc: PolicyDocument,
	options: {
		baseDir: string;
		depth?: number;
		chain?: string[];
	},
): PolicyDocument {
	const depth = options.depth ?? 0;
	const chain = options.chain ?? [];
	if (depth > MAX_EXTENDS_DEPTH) {
		const err = new Error("extends depth exceeded");
		(err as Error & { code: string }).code = POLICY_E006;
		throw err;
	}
	if (!doc.extends) {
		return buildDocument({
			version: doc.version ?? "1",
			...(doc.policyVersion !== undefined ? { policyVersion: doc.policyVersion } : {}),
			...(doc.mode !== undefined ? { mode: doc.mode } : {}),
			...(doc.byte !== undefined ? { byte: doc.byte } : {}),
			...(doc.rules !== undefined ? { rules: doc.rules } : {}),
		});
	}

	const extendsRef = doc.extends;
	if (chain.includes(extendsRef)) {
		const err = new Error(`extends cycle: ${[...chain, extendsRef].join(" → ")}`);
		(err as Error & { code: string }).code = POLICY_E005;
		throw err;
	}

	let base: PolicyDocument;
	let childBaseDir: string;
	if ((BUILTIN_PROFILES as readonly string[]).includes(extendsRef)) {
		base = loadProfileDocument(extendsRef);
		childBaseDir = options.baseDir;
	} else {
		const relPath = join(options.baseDir, extendsRef);
		if (!existsSync(relPath)) {
			throw new Error(`extends file not found: ${extendsRef}`);
		}
		const text = readFileSync(relPath, "utf8");
		base = parsePolicyFile(text, relPath) as PolicyDocument;
		childBaseDir = dirname(relPath);
	}

	const { extends: _drop, ...overrideFields } = doc;
	const mergedBase = resolveExtends(base, {
		baseDir: childBaseDir,
		depth: depth + 1,
		chain: [...chain, extendsRef],
	});

	return mergePolicyDocuments(mergedBase, overrideFields);
}
