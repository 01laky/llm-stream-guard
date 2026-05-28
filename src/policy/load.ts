import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { applyModeOverride, compilePolicy } from "./compile.js";
import { resolveExtends } from "./merge.js";
import { parsePolicyFile } from "./parse-yaml-minimal.js";
import type { CompileOptions, LoadedPolicy, LoadPolicyOptions, PolicyDocument } from "./types.js";
import { validatePolicy } from "./validate.js";

function readPolicyDocument(path: string): PolicyDocument {
	const text = readFileSync(path, "utf8");
	return parsePolicyFile(text, path) as PolicyDocument;
}

export function resolvePolicyDocument(path: string, options?: LoadPolicyOptions): PolicyDocument {
	const baseDir = options?.baseDir ?? dirname(path);
	let doc = readPolicyDocument(path);

	if (!options?.noExtends && doc.extends) {
		doc = resolveExtends(doc, { baseDir });
	}

	const validated = validatePolicy(doc);
	if (!validated.ok) {
		const msg = validated.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("; ");
		throw new Error(msg);
	}

	return validated.document;
}

export function loadPolicy(path: string, options?: LoadPolicyOptions): LoadedPolicy {
	const baseDir = options?.baseDir ?? dirname(path);
	let doc = readPolicyDocument(path);
	let profile: string | undefined;

	if (!options?.noExtends && doc.extends) {
		profile = doc.extends;
		doc = resolveExtends(doc, { baseDir });
	}

	const validated = validatePolicy(doc);
	if (!validated.ok) {
		const msg = validated.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("; ");
		throw new Error(msg);
	}

	const mode = applyModeOverride(validated.document.mode ?? "block", options);
	const compileOpts: { mode: typeof mode; profile?: string } = { mode };
	if (profile) compileOpts.profile = profile;
	return compilePolicy(validated.document, compileOpts);
}

export function loadPolicyDocumentFromUnknown(
	doc: unknown,
	options?: CompileOptions,
): LoadedPolicy {
	let policyDoc = doc as PolicyDocument;
	if (!options?.noExtends && policyDoc.extends) {
		policyDoc = resolveExtends(policyDoc, {
			baseDir: options?.baseDir ?? process.cwd(),
		});
	}
	const validated = validatePolicy(policyDoc);
	if (!validated.ok) {
		const msg = validated.errors.map((e) => `${e.code} ${e.path} ${e.message}`).join("; ");
		throw new Error(msg);
	}
	const mode = applyModeOverride(validated.document.mode ?? "block", options);
	return compilePolicy(validated.document, { mode });
}

export { parsePolicyFile, parsePolicyYaml } from "./parse-yaml-minimal.js";
