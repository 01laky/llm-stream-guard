#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = join(root, "test/fixtures/policies/REGISTRY.md");
const registry = readFileSync(registryPath, "utf8");

const rows = [...registry.matchAll(/\|\s*(valid|invalid)\/([^\s|]+)\s*\|/g)].map((m) => ({
	kind: m[1],
	file: m[2],
}));

const listed = new Set(rows.map((r) => `${r.kind}/${r.file}`));

for (const kind of ["valid", "invalid"]) {
	const dir = join(root, "test/fixtures/policies", kind);
	if (!existsSync(dir)) continue;
	for (const name of readdirSync(dir)) {
		if (name.startsWith(".")) continue;
		const key = `${kind}/${name}`;
		if (!listed.has(key)) {
			throw new Error(`REGISTRY.md missing entry for ${key}`);
		}
	}
}

for (const row of rows) {
	const path = join(root, "test/fixtures/policies", row.kind, row.file);
	if (!existsSync(path)) {
		throw new Error(`REGISTRY lists missing file: ${row.kind}/${row.file}`);
	}
}

console.log(`OK: policy fixture registry covers ${rows.length} files`);
