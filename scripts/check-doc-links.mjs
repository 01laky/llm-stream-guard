#!/usr/bin/env node
/**
 * LSG-DOC30 — relative markdown link checker for docs and README files.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const defaultFiles = [
	"README.md",
	"CONTRIBUTING.md",
	"SECURITY.md",
	"examples/README.md",
	"action/README.md",
	"schemas/README.md",
	...readdirSync(join(rootDir, "docs"))
		.filter((name) => name.endsWith(".md"))
		.map((name) => join("docs", name)),
];

function collectFiles() {
	const argIdx = process.argv.indexOf("--files");
	if (argIdx === -1) return defaultFiles;
	const list = process.argv[argIdx + 1];
	if (!list) return defaultFiles;
	return list
		.split(",")
		.map((f) => f.trim())
		.filter(Boolean);
}

function resolveLink(fromFile, href) {
	if (
		!href ||
		href.startsWith("http://") ||
		href.startsWith("https://") ||
		href.startsWith("mailto:") ||
		href.startsWith("#")
	) {
		return null;
	}
	const [pathPart, anchor] = href.split("#");
	const base = dirname(join(rootDir, fromFile));
	let target = resolve(base, pathPart);
	if (!extname(target) && !existsSync(target)) {
		if (existsSync(`${target}.md`)) target = `${target}.md`;
		else if (existsSync(join(target, "README.md"))) target = join(target, "README.md");
	}
	return { target, anchor };
}

const errors = [];

for (const rel of collectFiles()) {
	const abs = join(rootDir, rel);
	if (!existsSync(abs)) {
		errors.push(`missing scan file: ${rel}`);
		continue;
	}
	const text = readFileSync(abs, "utf8");
	const re = /\]\(([^)]+)\)/g;
	let match;
	while ((match = re.exec(text)) !== null) {
		const href = match[1].trim();
		const resolved = resolveLink(rel, href);
		if (!resolved) continue;
		const { target } = resolved;
		if (!existsSync(target)) {
			errors.push(`broken: ${rel} → ${href} (${target})`);
		}
	}
}

if (errors.length > 0) {
	for (const e of errors) console.error(e);
	if (checkOnly) process.exit(1);
	process.exitCode = 1;
} else {
	console.log(`OK: ${collectFiles().length} file(s) link check passed`);
}
