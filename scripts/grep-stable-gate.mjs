#!/usr/bin/env node
/**
 * LSG-REL67 — fail on preview/stub/before v1.0 language in stable surfaces.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const SCAN_ROOTS = ["src", "action", "docs"];
const PATTERNS = [/\bpreview\b/i, /\bstub\b/i, /before v1\.0/i, /llm-stream-guard-preview/i];

const ALLOWLIST = new Set([
	"CHANGELOG.md",
	"docs/faq-archive.md",
	"docs/roadmap-post-1.0.md",
	"docs/proposal.MD",
	"docs/migration-0.x-to-1.0.md",
	"docs/testing-strategy.md",
	"docs/proposal.MD",
	"docs/faq.md",
	"docs/upgrade-guide.md",
	"docs/testing-strategy.md",
	"examples/README.md",
	"examples/types/stub-events.ts",
	"examples/types/stubs.d.ts",
]);

function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const path = join(dir, name);
		const rel = relative(rootDir, path);
		if (rel.includes("node_modules") || rel.includes("/dist/")) continue;
		const st = statSync(path);
		if (st.isDirectory()) walk(path, out);
		else if (/\.(ts|js|mjs|md|yml|yaml)$/i.test(name)) out.push(path);
	}
	return out;
}

const hits = [];
for (const root of SCAN_ROOTS) {
	const base = join(rootDir, root);
	for (const file of walk(base)) {
		const rel = relative(rootDir, file);
		if (ALLOWLIST.has(rel)) continue;
		const text = readFileSync(file, "utf8");
		for (const pattern of PATTERNS) {
			if (pattern.test(text)) {
				hits.push({ file: rel, pattern: pattern.source });
				break;
			}
		}
	}
}

if (hits.length > 0) {
	console.error("grep-stable-gate: forbidden preview/stub language:");
	for (const h of hits) console.error(`  ${h.file} (${h.pattern})`);
	process.exit(1);
}

console.log(`OK: stable language gate (${SCAN_ROOTS.join(", ")})`);
if (!checkOnly) process.exit(0);
