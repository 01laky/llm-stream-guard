#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

if (!existsSync(join(root, "dist/index.js"))) {
	execFileSync("pnpm", ["build"], { cwd: root, stdio: "inherit" });
}

const { validatePolicy, resolvePolicyDocument, RULE_KEYS } = await import(
	join(root, "dist/index.js")
);

const schema = JSON.parse(readFileSync(join(root, "schemas/policy-v1.json"), "utf8"));
const schemaText = JSON.stringify(schema);
for (const key of RULE_KEYS) {
	if (!schemaText.includes(`"${key}"`)) {
		throw new Error(`schemas/policy-v1.json missing rule key: ${key}`);
	}
}

const policyPaths = [
	...globJson(join(root, "policies")),
	...globJson(join(root, "src/policy/profiles")),
	...globJson(join(root, "test/fixtures/policies/valid")),
];

for (const path of policyPaths) {
	const raw = JSON.parse(readFileSync(path, "utf8"));
	let doc = raw;
	if (path.includes("/examples/")) {
		doc = resolvePolicyDocument(path);
	}
	const result = validatePolicy(doc);
	if (!result.ok) {
		throw new Error(`${path}: expected valid policy: ${result.errors[0]?.message}`);
	}
}

console.log(`OK: validated ${policyPaths.length} policy files`);

function globJson(dir) {
	if (!existsSync(dir)) return [];
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...globJson(p));
		else if (entry.name.endsWith(".json")) out.push(p);
	}
	return out;
}
