#!/usr/bin/env node
/**
 * LSG-REL68 — verify bundled policy profile file hashes.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const profilesDir = join(rootDir, "src/policy/profiles");
const manifestPath = join(rootDir, "scripts/policy-profile-hashes.json");

function sha256File(path) {
	return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function currentHashes() {
	const out = {};
	for (const name of readdirSync(profilesDir)
		.filter((f) => f.endsWith(".json"))
		.sort()) {
		out[name] = sha256File(join(profilesDir, name));
	}
	return out;
}

const mode = process.argv.includes("--write") ? "write" : "check";
const current = currentHashes();

if (mode === "write") {
	const { writeFileSync } = await import("node:fs");
	writeFileSync(manifestPath, `${JSON.stringify(current, null, "\t")}\n`);
	console.log(`Wrote ${Object.keys(current).length} profile hashes to policy-profile-hashes.json`);
	process.exit(0);
}

const expected = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = [];
for (const [name, hash] of Object.entries(expected)) {
	if (current[name] !== hash) {
		errors.push(
			`${name}: expected ${hash.slice(0, 12)}… got ${(current[name] ?? "missing").slice(0, 12)}…`,
		);
	}
}
for (const name of Object.keys(current)) {
	if (!expected[name]) errors.push(`${name}: unexpected new profile (run --write)`);
}

if (errors.length > 0) {
	console.error("check-policy-profiles failed:");
	for (const e of errors) console.error(`  ${e}`);
	process.exit(1);
}

console.log(`OK: ${Object.keys(expected).length} policy profile hash(es)`);
