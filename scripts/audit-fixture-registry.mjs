#!/usr/bin/env node
/**
 * Ensure every file under test/fixtures is listed in REGISTRY.md and vice versa.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixturesDir = join(rootDir, "test/fixtures");
const registryPath = join(fixturesDir, "REGISTRY.md");
const registry = readFileSync(registryPath, "utf8");

function walk(dir) {
	const entries = [];
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) {
			entries.push(...walk(path));
		} else if (name !== "REGISTRY.md") {
			entries.push(relative(fixturesDir, path));
		}
	}
	return entries;
}

const files = walk(fixturesDir);
const errors = [];

for (const file of files) {
	if (file.startsWith(".")) continue;
	const base = file.split("/").pop() ?? file;
	if (!registry.includes(file) && !registry.includes(base)) {
		errors.push(`missing from REGISTRY.md: ${file}`);
	}
}

const referenced = [
	"byte-sse/sk-mid-line.sse",
	"byte-sse/sk-mid-line.expected.sse",
	"byte-sse/data-prefix-sk.sse",
	"redaction/text-sk.input.json",
	"redaction/text-sk.expected.json",
	"tool-policy/allow-blocked.input.json",
	"tool-policy/allow-blocked.expected.json",
	"events/bad-tool.json",
	"policies/valid/minimal.json",
	"policies/valid/extends-agent.resolved.json",
	"policies/invalid/missing-version.json",
	"policies/invalid/bad-regexp.json",
	"policies/invalid/allow-deny-overlap.json",
	"policies/invalid/empty-allow-block.json",
];

for (const ref of referenced) {
	if (!files.includes(ref)) {
		errors.push(`REGISTRY references missing file: ${ref}`);
	}
}

if (errors.length > 0) {
	console.error("fixtures:audit-registry failed:");
	for (const message of errors) console.error(`  - ${message}`);
	process.exit(1);
}

console.log(`OK: ${files.length} fixture files audited against REGISTRY.md`);
