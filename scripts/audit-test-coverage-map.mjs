#!/usr/bin/env node
/**
 * LSG-REL53 — map public exports to test references (min hits per export).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const minIdx = process.argv.indexOf("--min");
const minHits = minIdx === -1 ? 5 : Number(process.argv[minIdx + 1]);

const EXPORT_SOURCES = ["src/index.ts", "src/audit/index.ts"];
const SKIP = new Set([
	"DEFAULT_REDACT_PLACEHOLDER",
	"PACKAGE_VERSION",
	"listProfiles",
	"loadProfileDocument",
]);

function parseExports(path) {
	const text = readFileSync(join(rootDir, path), "utf8");
	const names = new Set();
	for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(\w+)/g)) names.add(m[1]);
	for (const m of text.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1]);
	for (const m of text.matchAll(/export\s+\{([^}]+)\}/g)) {
		for (const part of m[1].split(",")) {
			const trimmed = part.trim();
			if (!trimmed || trimmed.startsWith("type ")) continue;
			const name = trimmed.split(/\s+as\s+/)[0]?.trim();
			if (name && /^[A-Z_][A-Z0-9_]+$/.test(name)) continue; // skip ALL_CAPS constants re-exported
			if (name && name.endsWith("Event")) continue;
			if (name && /Options$|Config$|Context$|Severity$|Finding$|Document$|Manifest$/.test(name))
				continue;
			if (name) names.add(name);
		}
	}
	return [...names].filter((n) => !SKIP.has(n));
}

function walkTests(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) walkTests(path, out);
		else if (name.endsWith(".test.ts")) out.push(path);
	}
	return out;
}

const testFiles = walkTests(join(rootDir, "test"));
const testCorpus = testFiles.map((f) => readFileSync(f, "utf8")).join("\n");

const exports = [];
for (const src of EXPORT_SOURCES) {
	for (const name of parseExports(src)) exports.push({ name, src });
}

const errors = [];
console.log("| Export | Source | Test refs |");
console.log("|--------|--------|-----------|");

for (const { name, src } of exports) {
	const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
	const hits = (testCorpus.match(re) ?? []).length;
	console.log(`| ${name} | ${src} | ${hits} |`);
	if (hits < minHits) errors.push(`${name} (${src}): ${hits} refs < ${minHits}`);
}

if (errors.length > 0 && checkOnly) {
	console.error("\naudit-test-coverage-map failed:");
	for (const e of errors) console.error(`  - ${e}`);
	process.exit(1);
}

if (errors.length === 0) console.log(`\nOK: ${exports.length} exports meet min ${minHits} refs`);
