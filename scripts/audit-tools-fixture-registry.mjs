#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "test/fixtures/tools/REGISTRY.md");
const registry = readFileSync(registryPath, "utf8");
const fixtureRoot = join(root, "test/fixtures/tools");

const rows = [...registry.matchAll(/\|\s*([^\s|]+)\s*\|/g)]
	.map((m) => m[1])
	.filter((f) => f.includes(".") && f !== "Purpose" && f !== "File");

const listed = new Set(rows);

function walk(dir, prefix = "") {
	for (const name of readdirSync(dir)) {
		if (name.startsWith(".") || name === "REGISTRY.md") continue;
		const rel = prefix ? `${prefix}/${name}` : name;
		const full = join(dir, name);
		const st = statSync(full);
		if (st.isDirectory()) walk(full, rel);
		else if (!listed.has(rel)) throw new Error(`REGISTRY.md missing entry for ${rel}`);
	}
}

for (const row of rows) {
	const path = join(fixtureRoot, row);
	if (!existsSync(path)) throw new Error(`REGISTRY lists missing file: ${row}`);
}

walk(fixtureRoot);
console.log(`OK: tools fixture registry covers ${rows.length} files`);
